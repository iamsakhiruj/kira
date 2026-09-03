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

/** Payments for one booking, oldest first. */
export async function getPaymentsForBooking(
  bookingId: string,
): Promise<StoredBookingPayment[]> {
  const col = await collection();
  return col.find({ bookingId }).sort({ date: 1 }).toArray();
}

/** Payments for several bookings at once — for the list screen's outstanding
 * column, so it isn't one query per row. */
export async function getPaymentsForBookings(
  bookingIds: string[],
): Promise<StoredBookingPayment[]> {
  if (bookingIds.length === 0) return [];
  const col = await collection();
  return col.find({ bookingId: { $in: bookingIds } }).toArray();
}

export { ObjectId };
