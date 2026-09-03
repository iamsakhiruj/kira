/**
 * `bookings` and `bookingNights` DB access. Node runtime only; the pure
 * schemas and accrual arithmetic are in lib/bookings.ts.
 *
 * A booking and its per-night accrual rows are written together inside a
 * single Mongo transaction (Atlas is a three-node replica set — see CLAUDE.md
 * MongoDB notes; same pattern as setShares()). Either the booking, its nights
 * and its gapless reference all land, or none do — there is never a booking
 * with no nights, or a burned reference number with no booking. Audit entries
 * are collected in-transaction and written only after commit, so a rolled-back
 * attempt leaves no trace.
 *
 * `bookingNights` is the single source of truth for booking room revenue and
 * tourism tax (brief §4). The night report and date-range reports read it;
 * the stored night-report `rooms.revenueSen` never absorbs it, so nothing is
 * double-counted. Editing a booking deletes and regenerates its nights, so
 * the accrual ledger always matches the current booking.
 */

import {
  ObjectId,
  type Collection,
  type Document,
  type WithId,
} from "mongodb";
import { getDb, getMongoClient } from "./mongodb";
import type { AuditInput } from "./audit";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import { nextSequence } from "./countersStore";
import {
  type BookingInput,
  type BookingStatus,
  type CancellationStatus,
  type LetterConfig,
  type AccrualInput,
  bookingNightsFor,
  bookingTotals,
  roomLineTotals,
  nightsBetween,
  formatBookingRef,
} from "./bookings";

export type StoredBooking = WithId<Document>;

async function bookingsCol(): Promise<Collection<Document>> {
  return (await getDb()).collection("bookings");
}
async function nightsCol(): Promise<Collection<Document>> {
  return (await getDb()).collection("bookingNights");
}
async function paymentsCol(): Promise<Collection<Document>> {
  return (await getDb()).collection("bookingPayments");
}

export async function ensureBookingIndexes(): Promise<void> {
  const [bookings, nights] = await Promise.all([bookingsCol(), nightsCol()]);
  await Promise.all([
    bookings.createIndex({ reference: 1 }, { unique: true }),
    bookings.createIndex({ createdAt: -1 }),
    bookings.createIndex({ status: 1 }),
    bookings.createIndex({ checkIn: 1 }), // guests-by-nationality report range
    bookings.createIndex({ "cancellation.cancelledOn": 1 }), // cancellations report

    // The accrual ledger is queried by date (night report + range reports)
    // and by bookingId (delete-and-regenerate on edit).
    nights.createIndex({ date: 1 }),
    nights.createIndex({ bookingId: 1 }),
  ]);
}

/** The accrual inputs the pure helpers need, pulled off a booking input. */
function accrualOf(input: BookingInput): AccrualInput {
  return {
    rooms: input.rooms.map((l) => ({
      roomsCount: l.roomsCount,
      ratePerNightSen: l.ratePerNightSen,
      checkIn: l.checkIn,
      checkOut: l.checkOut,
    })),
    tourismTaxApplicable: input.tourismTaxApplicable,
    tourismTaxPerRoomPerNightSen: input.tourismTaxPerRoomPerNightSen,
    status: input.status,
  };
}

/** Rebuild the accrual inputs from a stored booking document (for a
 * status-only change, which recomputes from the saved room lines). Uses
 * storedRoomLines so a legacy single-room booking is handled too. */
function accrualOfStored(doc: Document, status: BookingStatus): AccrualInput {
  return {
    rooms: storedRoomLines(doc).map((l) => ({
      roomsCount: l.roomsCount,
      ratePerNightSen: l.ratePerNightSen,
      checkIn: l.checkIn,
      checkOut: l.checkOut,
    })),
    tourismTaxApplicable: Boolean(doc.tourismTaxApplicable),
    tourismTaxPerRoomPerNightSen: Number(doc.tourismTaxPerRoomPerNightSen) || 0,
    status,
  };
}

/** Build the stored booking document body (everything but _id) from an input,
 * with per-line and aggregate totals snapshotted for display. */
function bookingBody(input: BookingInput) {
  const totals = bookingTotals(accrualOf(input));
  return {
    guestName: input.guestName,
    guestIdNumber: input.guestIdNumber,
    nationality: input.nationality,
    email: input.email,
    phone: input.phone,
    address: input.address,
    tin: input.tin,
    // Booking-level span (headline + the default each room line takes).
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    // One embedded document per room line, with its own computed nights/total.
    rooms: input.rooms.map((l) => {
      const lt = roomLineTotals(l);
      return {
        roomType: l.roomType,
        roomsCount: l.roomsCount,
        ratePerNightSen: l.ratePerNightSen,
        checkIn: l.checkIn,
        checkOut: l.checkOut,
        nights: lt.nights,
        lineTotalSen: lt.lineTotalSen,
      };
    }),
    tourismTaxApplicable: input.tourismTaxApplicable,
    tourismTaxPerRoomPerNightSen: input.tourismTaxPerRoomPerNightSen,
    tourismTaxOverrideReason: input.tourismTaxOverrideReason,
    status: input.status,
    source: input.source,
    notes: input.notes,
    totalRooms: totals.totalRooms,
    roomNights: totals.roomNights,
    roomRevenueSen: totals.roomRevenueSen,
    tourismTaxSen: totals.tourismTaxSen,
    grandTotalSen: totals.grandTotalSen,
  };
}

/** The bookingNights rows for a booking, one per night summed across its room
 * lines (roomsCount = total rooms occupied that night). */
function nightDocsFor(
  bookingId: string,
  reference: string,
  accrual: AccrualInput,
): Document[] {
  return bookingNightsFor(accrual).map((n) => ({
    bookingId,
    reference,
    date: n.date,
    roomsCount: n.roomsCount,
    roomRevenueSen: n.roomRevenueSen,
    tourismTaxSen: n.tourismTaxSen,
  }));
}

/**
 * Create a booking with a gapless reference and its accrual nights, all in one
 * transaction. Returns the new booking id and its reference.
 */
export async function createBooking(
  input: BookingInput,
  actor: { id: string; role: Role },
): Promise<{ id: string; reference: string }> {
  const now = new Date();
  const year = now.getUTCFullYear();

  const bookings = await bookingsCol();
  const nights = await nightsCol();
  const client = await getMongoClient();
  const session = client.startSession();
  const auditOps: AuditInput[] = [];
  let bookingId = "";
  let reference = "";

  try {
    await session.withTransaction(async () => {
      // Reset in case withTransaction retries on a transient error.
      auditOps.length = 0;

      const seq = await nextSequence(`booking-${year}`, session);
      reference = formatBookingRef(year, seq);

      const doc = {
        reference,
        ...bookingBody(input),
        lastLetterConfig: null as LetterConfig | null,
        createdBy: actor.id,
        createdAt: now,
        updatedBy: null as string | null,
        updatedAt: null as Date | null,
      };
      const res = await bookings.insertOne(doc, { session });
      bookingId = res.insertedId.toString();

      const nightDocs = nightDocsFor(bookingId, reference, accrualOf(input));
      if (nightDocs.length > 0) {
        await nights.insertMany(nightDocs, { session });
      }

      auditOps.push({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create",
        collection: "bookings",
        documentId: bookingId,
        before: null,
        after: doc,
      });
    });
  } finally {
    await session.endSession();
  }

  for (const op of auditOps) await recordAudit(op);
  return { id: bookingId, reference };
}

/**
 * Replace a booking's figures (a manager/owner edit) and regenerate its
 * accrual nights, atomically. Reference, createdBy and createdAt are never
 * touched. Returns the updated booking, or null if it no longer exists.
 */
export async function updateBooking(
  id: string,
  input: BookingInput,
  actor: { id: string; role: Role },
): Promise<StoredBooking | null> {
  if (!ObjectId.isValid(id)) return null;
  const _id = new ObjectId(id);
  const bookings = await bookingsCol();
  const nights = await nightsCol();

  const before = await bookings.findOne({ _id });
  if (!before) return null;

  const client = await getMongoClient();
  const session = client.startSession();
  const auditOps: AuditInput[] = [];
  let after: StoredBooking | null = null;

  try {
    await session.withTransaction(async () => {
      auditOps.length = 0;

      after = (await bookings.findOneAndUpdate(
        { _id },
        {
          $set: {
            ...bookingBody(input),
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after", session },
      )) as StoredBooking | null;

      // Regenerate the accrual ledger for this booking.
      await nights.deleteMany({ bookingId: id }, { session });
      const nightDocs = nightDocsFor(id, String(before.reference), accrualOf(input));
      if (nightDocs.length > 0) {
        await nights.insertMany(nightDocs, { session });
      }

      auditOps.push({
        actorId: actor.id,
        actorRole: actor.role,
        action: "update",
        collection: "bookings",
        documentId: id,
        before,
        after,
      });
    });
  } finally {
    await session.endSession();
  }

  for (const op of auditOps) await recordAudit(op);
  return after;
}

/**
 * Change only a booking's status (check in / out, cancel, no-show) and
 * regenerate its nights — a cancelled or no-show booking drops all its
 * accrual. Recomputes totals from the booking's existing figures. Returns the
 * updated booking, or null if it no longer exists.
 */
export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  actor: { id: string; role: Role },
): Promise<StoredBooking | null> {
  if (!ObjectId.isValid(id)) return null;
  const _id = new ObjectId(id);
  const bookings = await bookingsCol();
  const nights = await nightsCol();

  const before = await bookings.findOne({ _id });
  if (!before) return null;

  // Rebuild the accrual inputs from the stored room lines, swapping in the new
  // status (cancelled / no-show drop all accrual).
  const accrual = accrualOfStored(before, status);
  const totals = bookingTotals(accrual);

  const client = await getMongoClient();
  const session = client.startSession();
  const auditOps: AuditInput[] = [];
  let after: StoredBooking | null = null;

  try {
    await session.withTransaction(async () => {
      auditOps.length = 0;

      after = (await bookings.findOneAndUpdate(
        { _id },
        {
          $set: {
            status,
            totalRooms: totals.totalRooms,
            roomNights: totals.roomNights,
            roomRevenueSen: totals.roomRevenueSen,
            tourismTaxSen: totals.tourismTaxSen,
            grandTotalSen: totals.grandTotalSen,
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after", session },
      )) as StoredBooking | null;

      await nights.deleteMany({ bookingId: id }, { session });
      const nightDocs = nightDocsFor(id, String(before.reference), accrual);
      if (nightDocs.length > 0) {
        await nights.insertMany(nightDocs, { session });
      }

      auditOps.push({
        actorId: actor.id,
        actorRole: actor.role,
        action: "update",
        collection: "bookings",
        documentId: id,
        before,
        after,
        reason: `status → ${status}`,
      });
    });
  } finally {
    await session.endSession();
  }

  for (const op of auditOps) await recordAudit(op);
  return after;
}

export interface CancelBookingInput {
  status: CancellationStatus;
  reason: string;
  /** Business date of the cancellation (for report range queries). */
  cancelledOn: string;
  depositHeldSen: number;
  refundedSen: number;
  forfeitedSen: number;
  refundPaymentMethodId: string;
  refundReference: string;
}

/**
 * Cancel a booking (or mark it no-show) — never delete it. Atomically: sets the
 * status, zeroes accrual and deletes its bookingNights (so its room-nights stop
 * accruing revenue and its rooms leave the rooms-sold count for those dates),
 * writes a cancellation record (reason, who/when, the value lost, and the
 * deposit disposition), and — if any deposit is being refunded — inserts a
 * refund payment against the booking in the SAME transaction (so a paid deposit
 * is never orphaned). The forfeited remainder becomes revenue, surfaced in
 * reports (never a second cash movement — the deposit cash was already banked).
 *
 * Guarded on the current status not already being cancelled/no-show, so a
 * double-submit can't cancel twice or refund twice. Returns the updated
 * booking, or null if it no longer exists or was already cancelled.
 */
export async function cancelBooking(
  id: string,
  input: CancelBookingInput,
  actor: { id: string; role: Role },
): Promise<StoredBooking | null> {
  if (!ObjectId.isValid(id)) return null;
  const _id = new ObjectId(id);
  const bookings = await bookingsCol();
  const nights = await nightsCol();
  const payments = await paymentsCol();

  const before = await bookings.findOne({ _id });
  if (!before) return null;
  if (before.status === "cancelled" || before.status === "no_show") return null;

  const now = new Date();
  const cancellation = {
    reason: input.reason,
    cancelledBy: actor.id,
    cancelledAt: now,
    cancelledOn: input.cancelledOn,
    // The booking's value before cancelling — what was lost (accrual zeroes out).
    bookingValueSen: Number(before.grandTotalSen) || 0,
    depositHeldSen: input.depositHeldSen,
    refundedSen: input.refundedSen,
    forfeitedSen: input.forfeitedSen,
  };

  const client = await getMongoClient();
  const session = client.startSession();
  const auditOps: AuditInput[] = [];
  let after: StoredBooking | null = null;

  try {
    await session.withTransaction(async () => {
      auditOps.length = 0;

      after = (await bookings.findOneAndUpdate(
        {
          _id,
          status: { $nin: ["cancelled", "no_show"] },
        },
        {
          $set: {
            status: input.status,
            totalRooms: 0,
            roomNights: 0,
            roomRevenueSen: 0,
            tourismTaxSen: 0,
            grandTotalSen: 0,
            cancellation,
            updatedBy: actor.id,
            updatedAt: now,
          },
        },
        { returnDocument: "after", session },
      )) as StoredBooking | null;

      // Raced with another cancel — leave everything untouched.
      if (!after) return;

      // Its accrual stops: delete all bookingNights (revenue + rooms-sold).
      await nights.deleteMany({ bookingId: id }, { session });

      auditOps.push({
        actorId: actor.id,
        actorRole: actor.role,
        action: "update",
        collection: "bookings",
        documentId: id,
        before,
        after,
        reason: `${input.status}: ${input.reason}`,
      });

      // Refund the disposed portion, in the same transaction, so a paid
      // deposit is never left orphaned by a partial failure.
      if (input.refundedSen > 0) {
        const refund = {
          bookingId: id,
          date: input.cancelledOn,
          amountSen: input.refundedSen,
          paymentMethodId: input.refundPaymentMethodId,
          type: "refund" as const,
          reference: input.refundReference,
          note: `Cancellation refund (${input.status})`,
          recordedBy: actor.id,
          recordedAt: now,
        };
        const res = await payments.insertOne(refund, { session });
        auditOps.push({
          actorId: actor.id,
          actorRole: actor.role,
          action: "create",
          collection: "bookingPayments",
          documentId: res.insertedId.toString(),
          before: null,
          after: refund,
          reason: "cancellation refund",
        });
      }
    });
  } finally {
    await session.endSession();
  }

  for (const op of auditOps) await recordAudit(op);
  return after;
}

/**
 * Cancelled / no-show bookings whose cancellation falls within [from, to]
 * (business-date range on the stored `cancellation.cancelledOn`). Feeds the
 * reports cancellations breakdown.
 */
export async function getBookingsCancelledBetween(
  fromDate: string,
  toDate: string,
): Promise<StoredBooking[]> {
  const col = await bookingsCol();
  return col
    .find({ "cancellation.cancelledOn": { $gte: fromDate, $lte: toDate } })
    .toArray();
}

/** Store the letter configuration last used for a booking, so a reprint
 * matches what was issued and "last used" becomes the default (brief §3). */
export async function updateBookingLetterConfig(
  id: string,
  config: LetterConfig,
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid booking id.");
  const _id = new ObjectId(id);
  const col = await bookingsCol();
  const before = await col.findOne({ _id });
  if (!before) throw new Error("That booking no longer exists.");
  const after = await col.findOneAndUpdate(
    { _id },
    { $set: { lastLetterConfig: config } },
    { returnDocument: "after" },
  );
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "bookings",
    documentId: id,
    before,
    after,
    reason: "reservation letter generated",
  });
}

// --- reads ----------------------------------------------------------------

export interface StoredRoomLine {
  roomType: string;
  roomsCount: number;
  ratePerNightSen: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  lineTotalSen: number;
}

/**
 * Room lines from a stored booking, normalizing the LEGACY single-room shape
 * (bookings created before the multi-room restructure, where `rooms` was a
 * number and the type/rate/dates lived on the booking itself) into one line.
 * Every read path goes through this, so an old booking still renders and,
 * when next edited, is rewritten in the new shape. Nothing is mutated here.
 */
export function storedRoomLines(doc: Document): StoredRoomLine[] {
  const rooms = doc.rooms;
  if (Array.isArray(rooms)) {
    return rooms.map((l) => ({
      roomType: String(l.roomType ?? ""),
      roomsCount: Number(l.roomsCount) || 0,
      ratePerNightSen: Number(l.ratePerNightSen) || 0,
      checkIn: String(l.checkIn ?? doc.checkIn ?? ""),
      checkOut: String(l.checkOut ?? doc.checkOut ?? ""),
      nights: Number(l.nights) || 0,
      lineTotalSen: Number(l.lineTotalSen) || 0,
    }));
  }
  // Legacy single-room booking: synthesize one line from the old fields.
  const roomsCount = Number(rooms) || 0;
  const checkIn = String(doc.checkIn ?? "");
  const checkOut = String(doc.checkOut ?? "");
  const nights = Number(doc.nights) || nightsBetween(checkIn, checkOut);
  const ratePerNightSen = Number(doc.ratePerNightSen) || 0;
  return [
    {
      roomType: String(doc.roomType ?? ""),
      roomsCount,
      ratePerNightSen,
      checkIn,
      checkOut,
      nights,
      lineTotalSen:
        Number(doc.roomRevenueSen) || roomsCount * nights * ratePerNightSen,
    },
  ];
}

/** Total rooms across a stored booking's lines (legacy-safe). */
export function storedTotalRooms(doc: Document): number {
  return storedRoomLines(doc).reduce((s, l) => s + l.roomsCount, 0);
}

/** Total room-nights across a stored booking's lines (legacy-safe). */
export function storedRoomNights(doc: Document): number {
  return storedRoomLines(doc).reduce((s, l) => s + l.roomsCount * l.nights, 0);
}

export async function getBookingById(
  id: string,
): Promise<StoredBooking | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await bookingsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

/** Most recent bookings first — the list screen. */
export async function listBookings(limit = 200): Promise<StoredBooking[]> {
  const col = await bookingsCol();
  return col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

/**
 * Bookings whose check-in falls within [from, to] (inclusive). Feeds the
 * guests-by-nationality report — "which markets you actually serve" is about
 * arrivals in the period. Lexicographic range on the `checkIn` string.
 */
export async function getBookingsByCheckInBetween(
  fromDate: string,
  toDate: string,
): Promise<StoredBooking[]> {
  const col = await bookingsCol();
  return col
    .find({ checkIn: { $gte: fromDate, $lte: toDate } })
    .toArray();
}

export interface NightAccrual {
  /** Total rooms occupied that date across all bookings — rooms, not
   * bookings (brief: three rooms on one booking is three rooms). */
  roomsCount: number;
  roomRevenueSen: number;
  tourismTaxSen: number;
}

const EMPTY_ACCRUAL: NightAccrual = {
  roomsCount: 0,
  roomRevenueSen: 0,
  tourismTaxSen: 0,
};

/**
 * Booking accrual per date for a set of business dates — one query, summed in
 * JS. Feeds the night report's read-only "from bookings staying tonight" line
 * (rooms + revenue) and its tourism-tax line (brief §4). Dates with no bookings
 * are absent from the map; callers default to zero.
 */
export async function getBookingAccrualByDates(
  dates: string[],
): Promise<Map<string, NightAccrual>> {
  const out = new Map<string, NightAccrual>();
  if (dates.length === 0) return out;
  const col = await nightsCol();
  const rows = await col.find({ date: { $in: dates } }).toArray();
  for (const r of rows) {
    const key = String(r.date);
    const cur = out.get(key) ?? { ...EMPTY_ACCRUAL };
    cur.roomsCount += Number(r.roomsCount) || 0;
    cur.roomRevenueSen += Number(r.roomRevenueSen) || 0;
    cur.tourismTaxSen += Number(r.tourismTaxSen) || 0;
    out.set(key, cur);
  }
  return out;
}

/** Booking accrual for a single date (convenience over the batch form). */
export async function getBookingAccrualForDate(
  date: string,
): Promise<NightAccrual> {
  return (await getBookingAccrualByDates([date])).get(date) ?? { ...EMPTY_ACCRUAL };
}

/**
 * Total booking room revenue and tourism tax whose nights fall within a date
 * range (inclusive) — for the monthly/date-range reports and the tourism-tax
 * remittance figure. Lexicographic range on the indexed `date` string.
 */
export async function sumBookingNightsBetween(
  fromDate: string,
  toDate: string,
): Promise<NightAccrual> {
  const col = await nightsCol();
  const rows = await col
    .find({ date: { $gte: fromDate, $lte: toDate } })
    .toArray();
  return rows.reduce<NightAccrual>(
    (acc, r) => ({
      roomsCount: acc.roomsCount + (Number(r.roomsCount) || 0),
      roomRevenueSen: acc.roomRevenueSen + (Number(r.roomRevenueSen) || 0),
      tourismTaxSen: acc.tourismTaxSen + (Number(r.tourismTaxSen) || 0),
    }),
    { ...EMPTY_ACCRUAL },
  );
}
