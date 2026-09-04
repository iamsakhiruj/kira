/**
 * `revenueEntries` DB access. Node runtime only — see `lib/revenueEntries.ts`
 * for why the schema lives in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import { type RevenueEntry, type RevenueEntryInputSchema } from "./revenueEntries";

export type StoredRevenueEntry = WithId<RevenueEntry>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("revenueEntries");
}

/** Excludes soft-deleted entries. Every balance/report query uses this so a
 * deleted entry stops counting the moment it's deleted. */
const NOT_DELETED = { deleted: { $ne: true } };

export async function ensureRevenueEntriesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ date: -1 });
  await col.createIndex({ linkedBusinessDayId: 1 });
}

const RECENT_LIMIT = 200;

/** Most recent standalone revenue entries, newest first. Excludes soft-deleted
 * unless includeDeleted is set (the list's "show deleted" toggle). */
export async function getRecentRevenueEntries(
  limit: number = RECENT_LIMIT,
  includeDeleted = false,
): Promise<StoredRevenueEntry[]> {
  const col = await collection();
  const docs = await col
    .find(includeDeleted ? {} : NOT_DELETED)
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
  return docs as StoredRevenueEntry[];
}

export async function getRevenueEntryById(
  id: string,
): Promise<StoredRevenueEntry | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredRevenueEntry | null>;
}

/** Standalone revenue entries in a calendar month ("YYYY-MM"). Lexicographic
 * range on the indexed `date` string. Excludes soft-deleted. */
export async function getRevenueEntriesForMonth(
  month: string,
): Promise<StoredRevenueEntry[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: `${month}-01`, $lte: `${month}-31` }, ...NOT_DELETED })
    .toArray();
  return docs as StoredRevenueEntry[];
}

/** Standalone revenue entries between two dates (inclusive). Excludes
 * soft-deleted by default — so balances and reports never count a deleted
 * entry; the /revenue page's "show deleted" toggle passes includeDeleted to
 * see them alongside the same range, view-only. */
export async function getRevenueEntriesBetween(
  fromDate: string,
  toDate: string,
  includeDeleted = false,
): Promise<StoredRevenueEntry[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: fromDate, $lte: toDate }, ...(includeDeleted ? {} : NOT_DELETED) })
    .toArray();
  return docs as StoredRevenueEntry[];
}

export async function createRevenueEntry(
  input: z.infer<typeof RevenueEntryInputSchema>,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: RevenueEntry = {
    ...input,
    recordedBy: actor.id,
    linkedBusinessDayId: null,
  };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "revenueEntries",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId.toString();
}

/** Edit an entry's fields. Editing the amount moves any account balance the
 * entry affects, because balances are computed on read from these documents.
 * Full before/after audit. Returns the updated doc, or null if it's gone or
 * already deleted (a deleted entry can't be edited). */
export async function updateRevenueEntry(
  id: string,
  input: z.infer<typeof RevenueEntryInputSchema>,
  actor: { id: string; role: Role },
): Promise<StoredRevenueEntry | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before || before.deleted === true) return null;

  const after = (await col.findOneAndUpdate(
    { _id, deleted: { $ne: true } },
    { $set: { ...input } },
    { returnDocument: "after" },
  )) as StoredRevenueEntry | null;
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "revenueEntries",
    documentId: id,
    before,
    after,
  });
  return after;
}

/** Soft-delete: never a hard removal. The document stays (audit trail intact,
 * past reports reproducible); it's just excluded from balances/reports and
 * hidden from the list by default. A reason is required. */
export async function softDeleteRevenueEntry(
  id: string,
  reason: string,
  actor: { id: string; role: Role },
): Promise<StoredRevenueEntry | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before || before.deleted === true) return null;

  const after = (await col.findOneAndUpdate(
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
  )) as StoredRevenueEntry | null;
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "delete",
    collection: "revenueEntries",
    documentId: id,
    before,
    after,
    reason,
  });
  return after;
}
