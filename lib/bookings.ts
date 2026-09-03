/**
 * Bookings — direct reservations taken by phone or walk-in (see
 * docs/bookings-build-brief.md). Pure module: schemas plus the money
 * arithmetic, no database import, safe to import from a client component.
 * DB access lives in lib/bookingsStore.ts, same split as
 * paymentMethods / paymentMethodsStore.
 *
 * Three accounting rules shape this file (brief §1):
 *
 *   1. Tourism tax is a LIABILITY, never revenue. RM 10 per room per night
 *      from foreign guests, collected for the government. It has its own
 *      field and its own total, and is never folded into room revenue.
 *   2. Room revenue ACCRUES PER NIGHT, not on check-in. A stay from 30 Aug
 *      to 14 Sep splits across two months. `bookingNightsFor()` produces one
 *      row per night so any date-range report counts only the nights inside
 *      it.
 *   3. Payment before the stay is a DEPOSIT, not revenue. That's tracked on
 *      the payments side (outstandingSen), never by pretending money in is
 *      revenue.
 *
 * Money is integer sen everywhere (`...Sen`), never floats (CLAUDE.md §1).
 */

import { z } from "zod";
import { MALAYSIA_CODE, isValidCountryCode } from "./countries";

// --- enums ----------------------------------------------------------------

export const BOOKING_STATUSES = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that represent an actual or expected stay, so their nights accrue
 * revenue. A cancelled or no-show booking earned nothing — no nights. */
const ACCRUING_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "confirmed",
  "checked_in",
  "checked_out",
]);

export function statusAccrues(status: BookingStatus): boolean {
  return ACCRUING_STATUSES.has(status);
}

export const BOOKING_SOURCES = [
  "direct_phone",
  "walk_in",
  "email",
  "ota",
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const PAYMENT_TYPES = [
  "deposit",
  "part_payment",
  "full",
  "refund",
] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** RM 10.00 per room per night — the Malaysian tourism tax rate for foreign
 * guests (brief §1, open question 1 confirms per room per night). A default
 * for the form, stored per booking so a rate change never rewrites history. */
export const TOURISM_TAX_PER_ROOM_PER_NIGHT_SEN = 1000;

/**
 * The default tourism-tax treatment for a nationality: Malaysian guests are
 * exempt (default OFF), every other nationality is charged (default ON).
 * Overridable per booking — exemptions exist (e.g. a permanent resident) — but
 * an override must carry a reason (enforced in BookingInputSchema below).
 */
export function tourismTaxDefaultApplies(countryCode: string): boolean {
  return countryCode !== MALAYSIA_CODE;
}

// --- shared validators ----------------------------------------------------

const senInt = z.number().int("Amounts are stored as whole sen.");
const nonNegSen = senInt.min(0, "Amount cannot be negative.");
const posSen = senInt.min(1, "Enter an amount greater than zero.");
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

// --- date arithmetic (pure) -----------------------------------------------

/** Parse a YYYY-MM-DD calendar label to a noon-UTC Date, so whole-day
 * arithmetic never straddles a boundary (same idiom as lib/businessDate.ts). */
function parseCalendarDate(date: string, fn: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`${fn}: date must be YYYY-MM-DD.`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLabel(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Number of nights between check-in and check-out. A guest checking in on the
 * 1st and out on the 4th stayed 3 nights (1st, 2nd, 3rd) — the check-out day
 * is not a night. Returns 0 if check-out is not strictly after check-in.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseCalendarDate(checkIn, "nightsBetween");
  const b = parseCalendarDate(checkOut, "nightsBetween");
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/**
 * The calendar date of each night of the stay, from check-in up to (but not
 * including) check-out. e.g. ("2026-08-30", "2026-09-02") -> ["2026-08-30",
 * "2026-08-31", "2026-09-01"]. Empty if the range is non-positive.
 */
export function stayNightDates(checkIn: string, checkOut: string): string[] {
  const n = nightsBetween(checkIn, checkOut);
  const start = parseCalendarDate(checkIn, "stayNightDates");
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(toLabel(d));
  }
  return dates;
}

// --- accrual --------------------------------------------------------------

export interface BookingNight {
  date: string;
  /** Total rooms occupied that night across every line covering it. */
  roomsCount: number;
  roomRevenueSen: number;
  tourismTaxSen: number;
}

/** One room line of a booking — its own type, count, rate and dates. A booking
 * has one or more of these; each line can leave on a different day. */
export interface RoomLineAccrual {
  roomsCount: number;
  ratePerNightSen: number;
  checkIn: string;
  checkOut: string;
}

/** The accrual inputs of a whole booking: its room lines plus the tourism-tax
 * settings that apply across all of them (per room per night). */
export interface AccrualInput {
  rooms: RoomLineAccrual[];
  tourismTaxApplicable: boolean;
  tourismTaxPerRoomPerNightSen: number;
  status: BookingStatus;
}

/** Nights, room-nights and money for a single room line. */
export function roomLineTotals(line: {
  roomsCount: number;
  ratePerNightSen: number;
  checkIn: string;
  checkOut: string;
}): { nights: number; roomNights: number; lineTotalSen: number } {
  const nights = nightsBetween(line.checkIn, line.checkOut);
  return {
    nights,
    roomNights: line.roomsCount * nights,
    lineTotalSen: line.roomsCount * nights * line.ratePerNightSen,
  };
}

/**
 * One row per night of the stay, summed across every room line covering that
 * night (rule 2 — accrual per night). A night's room revenue is
 * `Σ roomsCount × ratePerNightSen` over the lines active that night, and its
 * tourism tax is `Σ roomsCount × taxPerRoomPerNight` (rule 1 — kept entirely
 * separate from room revenue). Because it works line-by-line, a booking where
 * one room leaves early accrues correctly: that room simply stops contributing
 * to nights past its own check-out.
 *
 * Returns [] for a non-accruing status (cancelled / no-show) — nothing was
 * earned, so nothing accrues. This is what the store persists as
 * `bookingNights`, and what date-range reports and the night report read.
 */
export function bookingNightsFor(input: AccrualInput): BookingNight[] {
  if (!statusAccrues(input.status)) return [];
  const taxPerRoomNight = input.tourismTaxApplicable
    ? input.tourismTaxPerRoomPerNightSen
    : 0;
  const byDate = new Map<string, BookingNight>();
  for (const line of input.rooms) {
    for (const date of stayNightDates(line.checkIn, line.checkOut)) {
      const cur =
        byDate.get(date) ??
        { date, roomsCount: 0, roomRevenueSen: 0, tourismTaxSen: 0 };
      cur.roomsCount += line.roomsCount;
      cur.roomRevenueSen += line.roomsCount * line.ratePerNightSen;
      cur.tourismTaxSen += line.roomsCount * taxPerRoomNight;
      byDate.set(date, cur);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface BookingTotals {
  /** Σ roomsCount across all lines — rooms, not bookings. Three rooms on one
   * booking is three rooms (brief: rooms-sold reflects total rooms). */
  totalRooms: number;
  /** Σ roomsCount × nights across all lines — what tourism tax is charged on. */
  roomNights: number;
  roomRevenueSen: number;
  tourismTaxSen: number;
  /** Room + tourism tax — what the guest is billed in total (the two stay
   * separate lines on the letter and report, but the guest pays the sum). */
  grandTotalSen: number;
}

/**
 * Whole-booking totals, summed across room lines. Tourism tax is charged on the
 * total room-nights across all lines (three rooms for eight nights = 24
 * room-nights). A cancelled / no-show booking earns nothing, so its room-nights
 * and money are zero; `totalRooms` still reflects how many rooms it was for.
 */
export function bookingTotals(input: AccrualInput): BookingTotals {
  const accrues = statusAccrues(input.status);
  let totalRooms = 0;
  let roomNights = 0;
  let roomRevenueSen = 0;
  for (const line of input.rooms) {
    totalRooms += line.roomsCount;
    if (!accrues) continue;
    const t = roomLineTotals(line);
    roomNights += t.roomNights;
    roomRevenueSen += t.lineTotalSen;
  }
  const tourismTaxSen = input.tourismTaxApplicable
    ? roomNights * input.tourismTaxPerRoomPerNightSen
    : 0;
  return {
    totalRooms,
    roomNights,
    roomRevenueSen,
    tourismTaxSen,
    grandTotalSen: roomRevenueSen + tourismTaxSen,
  };
}

// --- payments / outstanding balance ---------------------------------------

export interface PaymentLike {
  amountSen: number;
  type: PaymentType;
}

export interface PaymentSummary {
  /** Money received (deposits, part payments, full) — refunds excluded. */
  paidSen: number;
  /** Money handed back to the guest. */
  refundedSen: number;
  /** paid − refunded: what the hotel is net holding against this booking. */
  netPaidSen: number;
}

export function summarisePayments(payments: PaymentLike[]): PaymentSummary {
  let paidSen = 0;
  let refundedSen = 0;
  for (const p of payments) {
    if (p.type === "refund") refundedSen += p.amountSen;
    else paidSen += p.amountSen;
  }
  return { paidSen, refundedSen, netPaidSen: paidSen - refundedSen };
}

/**
 * Outstanding balance (rule 3 lives on the other side of this — a deposit is
 * money held, and it reduces what's outstanding just like any payment). Never
 * stored; always computed from the billed total and the payments. Can go
 * negative (guest overpaid / net refund exceeds billing), which is shown, not
 * clamped, so an over-refund is visible rather than hidden.
 */
export function outstandingSen(
  grandTotalSen: number,
  payments: PaymentLike[],
): number {
  return grandTotalSen - summarisePayments(payments).netPaidSen;
}

// --- reference numbering --------------------------------------------------

/**
 * Format a gapless booking reference: (2026, 1) -> "BK-2026-0001". The
 * sequence is allocated per year by an atomic counter inside the booking's
 * write transaction (lib/countersStore.ts), so a rolled-back insert never
 * burns a number — sequential, gapless, never reused (brief §2).
 */
export function formatBookingRef(year: number, seq: number): string {
  return `BK-${year}-${String(seq).padStart(4, "0")}`;
}

// --- schemas --------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);

/** One room line: a room type, how many of it, its nightly rate, and its own
 * check-in/out (defaulting to the booking's dates in the UI, but stored per
 * line so one room can leave early). */
export const RoomLineInputSchema = z
  .object({
    roomType: trimmed(80).default(""),
    roomsCount: z.number().int().min(1, "At least one room."),
    ratePerNightSen: nonNegSen,
    checkIn: dateStr,
    checkOut: dateStr,
  })
  .refine((l) => nightsBetween(l.checkIn, l.checkOut) > 0, {
    message: "A room's check-out must be after its check-in.",
    path: ["checkOut"],
  });

export type RoomLineInput = z.infer<typeof RoomLineInputSchema>;

/** Guest identity + stay + room lines. What the client sends to create or edit
 * a booking; the server adds reference, computed totals, actor and timestamps.
 * A booking has ONE guest and one or more room lines. `checkIn`/`checkOut` are
 * the overall span (headline + the default each new room line takes). TIN and
 * full address are captured now even though e-Invoice isn't built — chasing a
 * guest for them after checkout is a bad afternoon (brief §2). */
export const BookingInputSchema = z
  .object({
    guestName: z.string().trim().min(1, "Enter the guest's name.").max(160),
    // Passport or IC is required — needed at check-in and to justify the
    // tourism-tax treatment (it was blank on the old confirmation).
    guestIdNumber: z
      .string()
      .trim()
      .min(1, "Enter the guest's passport or IC number.")
      .max(60),
    // Stored as an ISO 3166-1 alpha-2 code, not a display name, so reports
    // group reliably. Resolved to a name only at the display layer.
    nationality: z
      .string()
      .trim()
      .refine(isValidCountryCode, "Choose the guest's country."),
    email: trimmed(160).default(""),
    phone: trimmed(40).default(""),
    address: trimmed(400).default(""),
    tin: trimmed(60).default(""),

    checkIn: dateStr,
    checkOut: dateStr,
    rooms: z.array(RoomLineInputSchema).min(1, "Add at least one room.").max(30),

    tourismTaxApplicable: z.boolean(),
    tourismTaxPerRoomPerNightSen: nonNegSen,
    // Required only when the tax treatment differs from the nationality's
    // default (see the refine below).
    tourismTaxOverrideReason: trimmed(300).default(""),

    status: z.enum(BOOKING_STATUSES).default("confirmed"),
    source: z.enum(BOOKING_SOURCES),
    notes: trimmed(2000).default(""),
  })
  .refine((b) => nightsBetween(b.checkIn, b.checkOut) > 0, {
    message: "Check-out must be after check-in.",
    path: ["checkOut"],
  })
  .refine(
    (b) =>
      b.tourismTaxApplicable === tourismTaxDefaultApplies(b.nationality) ||
      b.tourismTaxOverrideReason.trim().length > 0,
    {
      message:
        "Tourism tax was changed from the default for this nationality — enter a short reason.",
      path: ["tourismTaxOverrideReason"],
    },
  );

export type BookingInput = z.infer<typeof BookingInputSchema>;

/** A payment against a booking. Outstanding balance is never stored — it's
 * computed from the booking total and these (outstandingSen). */
export const BookingPaymentInputSchema = z.object({
  bookingId: z.string().min(1, "Missing booking."),
  date: dateStr,
  amountSen: posSen,
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  type: z.enum(PAYMENT_TYPES),
  reference: trimmed(120).default(""),
  note: trimmed(300).default(""),
});

export type BookingPaymentInput = z.infer<typeof BookingPaymentInputSchema>;

// --- cancellation ---------------------------------------------------------
//
// Cancel, never delete — a deleted booking would take its payment history with
// it and orphan any deposit in the drawer. A cancelled/no-show booking keeps
// all its data; only its status, accrual (zeroed) and a cancellation record
// change. No-show is a separate status from cancelled because a no-show usually
// forfeits the deposit and a cancellation may not — but the mechanics are the
// same, and the person cancelling always chooses the deposit disposition.

export const CANCELLATION_STATUSES = ["cancelled", "no_show"] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number];

/**
 * What the client sends to cancel a booking. The deposit disposition is
 * expressed as the refunded amount: `refundedSen` of the deposit held goes back
 * to the guest (a refund payment), and the remainder is forfeited (becomes
 * revenue). Full refund = refundedSen equals the held deposit; full forfeit =
 * refundedSen is 0; partial = somewhere between. The held amount and the
 * forfeited remainder are computed server-side from the booking's payments — a
 * stale client figure can't over-refund. A refund needs a payment method.
 */
export const CancellationInputSchema = z.object({
  status: z.enum(CANCELLATION_STATUSES),
  reason: z.string().trim().min(1, "Enter a reason.").max(500),
  refundedSen: nonNegSen.default(0),
  /** Required only when refundedSen > 0 (checked in the action against the
   * live payment-method list). */
  refundPaymentMethodId: z.string().default(""),
  refundReference: trimmed(120).default(""),
});

export type CancellationInput = z.infer<typeof CancellationInputSchema>;

// --- reservation letter ---------------------------------------------------

/** Which optional fields the letter shows (the fixed fields — header, guest
 * name, stay, billing, totals, reference — are always present, brief §3). */
export const LETTER_OPTIONAL_FIELDS = [
  "nationality",
  "phone",
  "email",
  "roomType",
  "arrivalTime",
] as const;
export type LetterOptionalField = (typeof LETTER_OPTIONAL_FIELDS)[number];

/** Standard policy clauses, all included by default. Editable per booking as
 * checkboxes (brief §3). Text lives here so the letter and the template
 * editor read one list; the config only stores which keys are included. */
export const POLICY_CLAUSES: { key: string; text: string }[] = [
  {
    key: "check_in_out",
    text: "Check-in is from 2:00 PM and check-out is by 12:00 noon. Early check-in and late check-out are subject to availability.",
  },
  {
    key: "id_required",
    text: "A valid passport or identity card is required at check-in for all guests.",
  },
  {
    key: "deposit",
    text: "A deposit may be required on arrival and is refundable on check-out, subject to inspection of the room.",
  },
  {
    key: "cancellation",
    text: "Cancellations must be made in writing. Deposits paid may be forfeited in accordance with the agreed cancellation terms.",
  },
  {
    key: "no_smoking",
    text: "All rooms are strictly non-smoking. A cleaning charge applies to any breach.",
  },
];

export const POLICY_CLAUSE_KEYS = POLICY_CLAUSES.map((c) => c.key);

const ShowFieldsSchema = z.object({
  nationality: z.boolean(),
  phone: z.boolean(),
  email: z.boolean(),
  roomType: z.boolean(),
  arrivalTime: z.boolean(),
});

/**
 * The editable configuration of a reservation letter (brief §3). Stored with
 * the booking after each generate so a reprint weeks later matches what was
 * originally issued, not a silently different letter. The letter itself is a
 * *view* of the booking — payment status is always read live, never frozen
 * into this config.
 */
export const LetterConfigSchema = z.object({
  addressedTo: trimmed(300).default(""),
  remarks: trimmed(3000).default(""),
  /** Which POLICY_CLAUSE_KEYS to include; all by default. */
  clauseKeys: z.array(z.string().max(60)).max(20).default([...POLICY_CLAUSE_KEYS]),
  show: ShowFieldsSchema,
  /** Free text, shown only when show.arrivalTime is on. */
  arrivalTime: trimmed(40).default(""),
  /** The template picked, if any — for "last used becomes default". */
  templateId: z.string().nullable().default(null),
});

export type LetterConfig = z.infer<typeof LetterConfigSchema>;

/** Every optional field shown, every clause included — the default a fresh
 * letter opens with (brief §3: "all included by default"). */
export function defaultLetterConfig(): LetterConfig {
  return {
    addressedTo: "",
    remarks: "",
    clauseKeys: [...POLICY_CLAUSE_KEYS],
    show: {
      nationality: true,
      phone: true,
      email: true,
      roomType: true,
      arrivalTime: false,
    },
    arrivalTime: "",
    templateId: null,
  };
}

/** A named, reusable set of letter choices — "Visa application", "Company
 * booking", "Standard" (brief §3). Manager+ create and edit. */
export const LetterTemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  show: ShowFieldsSchema,
  clauseKeys: z.array(z.string().max(60)).max(20),
  defaultRemarks: trimmed(3000).default(""),
});

export type LetterTemplateInput = z.infer<typeof LetterTemplateInputSchema>;
