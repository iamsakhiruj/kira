/**
 * `bookingPayments` DB access. Node runtime only; the schema and the
 * outstanding-balance arithmetic are in lib/bookings.ts.
 *
 * One document per payment against a booking. Outstanding balance is never
 * stored — it's computed from the booking's billed total and these rows
 * (outstandingSen). A cash payment recorded here does NOT auto-post to the
 * night report's cash drawer (decision: booking cash stays in this ledger;
 * reception keeps typing physical desk cash into collections.cash as before,
 * and never enters the same cash in both places).
 */

import {
  ObjectId,
  type Collection,
  type Document,
  type WithId,
} from "mongodb";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import type { BookingPaymentInput } from "./bookings";

export type StoredBookingPayment = WithId<Document>;

async function collection(): Promise<Collection<Document>> {
  return (await getDb()).collection("bookingPayments");
}

/** Excludes soft-deleted payments — so outstanding balance and deposit-held
 * calculations never count a deleted payment. */
const NOT_DELETED = { deleted: { $ne: true } };

export async function ensureBookingPaymentIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ bookingId: 1, date: 1 });
}

export async function createBookingPayment(
  input: BookingPaymentInput,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc = {
    bookingId: input.bookingId,
    date: input.date,
    amountSen: input.amountSen,
    paymentMethodId: input.paymentMethodId,
    type: input.type,
    reference: input.reference,
    note: input.note,
    recordedBy: actor.id,
    recordedAt: new Date(),
  };
  const col = await collection();
  const res = await col.insertOne(doc);
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "bookingPayments",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
    reason: input.type === "refund" ? "booking refund" : undefined,
  });
  return res.insertedId.toString();
}

/** Payments for one booking, oldest first. Excludes soft-deleted unless
 * includeDeleted is set (the detail screen's "show deleted" toggle). */
export async function getPaymentsForBooking(
  bookingId: string,
  includeDeleted = false,
): Promise<StoredBookingPayment[]> {
  const col = await collection();
  const filter = includeDeleted ? { bookingId } : { bookingId, ...NOT_DELETED };
  return col.find(filter).sort({ date: 1 }).toArray();
}

/** Payments for several bookings at once — for the list screen's outstanding
 * column, so it isn't one query per row. Excludes soft-deleted. */
export async function getPaymentsForBookings(
  bookingIds: string[],
): Promise<StoredBookingPayment[]> {
  if (bookingIds.length === 0) return [];
  const col = await collection();
  return col.find({ bookingId: { $in: bookingIds }, ...NOT_DELETED }).toArray();
}

export async function getBookingPaymentById(
  id: string,
): Promise<StoredBookingPayment | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) });
}

/** Edit a payment (manager+). Changing the amount/type moves the booking's
 * outstanding, which is computed on read. Full before/after audit. */
export async function updateBookingPayment(
  id: string,
  input: BookingPaymentInput,
  actor: { id: string; role: Role },
): Promise<StoredBookingPayment | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before || before.deleted === true) return null;

  const after = await col.findOneAndUpdate(
    { _id, deleted: { $ne: true } },
    {
      $set: {
        date: input.date,
        amountSen: input.amountSen,
        paymentMethodId: input.paymentMethodId,
        type: input.type,
        reference: input.reference,
        note: input.note,
      },
    },
    { returnDocument: "after" },
  );
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "bookingPayments",
    documentId: id,
    before,
    after,
  });
  return after;
}

/** Soft-delete a payment: never a hard removal (a deleted deposit would be
 * orphaned). Required reason; excluded from outstanding, hidden by default. */
export async function softDeleteBookingPayment(
  id: string,
  reason: string,
  actor: { id: string; role: Role },
): Promise<StoredBookingPayment | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before || before.deleted === true) return null;

  const after = await col.findOneAndUpdate(
    { _id, deleted: { $ne: true } },
    {
      $set: {
        deleted: true,
        deletedReason: reason,
        deletedBy: actor.id,
        deletedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "delete",
    collection: "bookingPayments",
    documentId: id,
    before,
    after,
    reason,
  });
  return after;
}

export { ObjectId };
