/**
 * `revenueEntries` DB access. Node runtime only — see `lib/revenueEntries.ts`
 * for why the schema lives in a separate, pure file.
 */

import { type Collection, type Document, type WithId } from "mongodb";
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

export async function ensureRevenueEntriesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ date: -1 });
  await col.createIndex({ linkedBusinessDayId: 1 });
}

const RECENT_LIMIT = 200;

/** Most recent standalone revenue entries, newest first. */
export async function getRecentRevenueEntries(
  limit: number = RECENT_LIMIT,
): Promise<StoredRevenueEntry[]> {
  const col = await collection();
  const docs = await col.find({}).sort({ date: -1 }).limit(limit).toArray();
  return docs as StoredRevenueEntry[];
}

/** Standalone revenue entries in a calendar month ("YYYY-MM"). Lexicographic
 * range on the indexed `date` string. */
export async function getRevenueEntriesForMonth(
  month: string,
): Promise<StoredRevenueEntry[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: `${month}-01`, $lte: `${month}-31` } })
    .toArray();
  return docs as StoredRevenueEntry[];
}

/** Standalone revenue entries between two dates (inclusive). */
export async function getRevenueEntriesBetween(
  fromDate: string,
  toDate: string,
): Promise<StoredRevenueEntry[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: fromDate, $lte: toDate } })
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
