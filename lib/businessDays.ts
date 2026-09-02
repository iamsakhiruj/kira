/**
 * The `businessDays` collection — one document per business date, the whole
 * night report read and written together. Unique index on `date`: two reports
 * for the same day is a data-corruption bug, enforced in the database, not a
 * UI problem.
 */

import { ObjectId, type Collection, type Document, type InsertOneResult, type WithId } from "mongodb";
import { getDb } from "./mongodb";

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("businessDays");
}

/** Create the unique index on date. Idempotent. */
export async function ensureBusinessDaysIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ date: 1 }, { unique: true });
}

export async function getBusinessDay(date: string): Promise<Document | null> {
  const col = await collection();
  return col.findOne({ date });
}

/** Batch lookup for a set of dates — one query instead of N. */
export async function getBusinessDaysByDates(
  dates: string[],
): Promise<WithId<Document>[]> {
  if (dates.length === 0) return [];
  const col = await collection();
  return col.find({ date: { $in: dates } }).toArray();
}

export async function getBusinessDayById(
  id: string,
): Promise<WithId<Document> | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function insertBusinessDay(
  doc: Document,
): Promise<InsertOneResult<Document>> {
  const col = await collection();
  return col.insertOne(doc);
}

/**
 * The date of the earliest businessDays document ever, or null if none
 * exist. Used to stop "missing report" checks from reaching back before
 * the system was ever used — a brand-new property has no missing reports,
 * it just hasn't started yet.
 */
export async function getEarliestBusinessDate(): Promise<string | null> {
  const col = await collection();
  const doc = await col.find({}, { projection: { date: 1 } }).sort({ date: 1 }).limit(1).next();
  return doc ? String(doc.date) : null;
}

/** All business days in a calendar month ("YYYY-MM"), oldest first. Uses a
 * lexicographic range on the indexed `date` string — "2026-09-31" doesn't
 * exist but bounds the last real September day and excludes October. */
export async function getBusinessDaysForMonth(
  month: string,
): Promise<WithId<Document>[]> {
  const col = await collection();
  return col
    .find({ date: { $gte: `${month}-01`, $lte: `${month}-31` } })
    .sort({ date: 1 })
    .toArray();
}

/** Business days between two dates (inclusive), oldest first. */
export async function getBusinessDaysBetween(
  fromDate: string,
  toDate: string,
): Promise<WithId<Document>[]> {
  const col = await collection();
  return col
    .find({ date: { $gte: fromDate, $lte: toDate } })
    .sort({ date: 1 })
    .toArray();
}

/** Submitted days awaiting the owner's review, oldest first. */
export async function getPendingBusinessDays(): Promise<WithId<Document>[]> {
  const col = await collection();
  return col.find({ status: "submitted" }).sort({ date: 1 }).toArray();
}

/** Most recently approved days, newest first — for the review queue's history. */
export async function getRecentlyApprovedBusinessDays(
  limit: number,
): Promise<WithId<Document>[]> {
  const col = await collection();
  return col
    .find({ status: "approved" })
    .sort({ approvedAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Update a still-submitted day's figures (an owner/manager pre-approval edit).
 * Guarded by status: "submitted" in the filter so a day that was approved
 * between the caller's read and this write can't be edited — CLAUDE.md rule 5
 * (approved days are immutable) holds. Returns the updated doc, or null if it
 * was no longer submitted.
 */
export async function updateSubmittedBusinessDay(
  id: string,
  set: Record<string, unknown>,
): Promise<WithId<Document> | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOneAndUpdate(
    { _id: new ObjectId(id), status: "submitted" },
    { $set: set },
    { returnDocument: "after" },
  );
}

/**
 * Approve a submitted day: sets status/approvedBy/approvedAt. Guarded by
 * status: "submitted" in the filter so a double-click (or two owners
 * approving at once) can't approve the same day twice — the second call
 * simply matches nothing.
 */
export async function approveBusinessDay(
  id: string,
  approvedBy: string,
  approvedAt: Date,
): Promise<WithId<Document> | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), status: "submitted" },
    { $set: { status: "approved", approvedBy, approvedAt } },
    { returnDocument: "after" },
  );
  return result;
}
