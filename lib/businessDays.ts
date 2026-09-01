/**
 * The `businessDays` collection — one document per business date, the whole
 * night report read and written together. Unique index on `date`: two reports
 * for the same day is a data-corruption bug, enforced in the database, not a
 * UI problem.
 */

import type { Collection, Document, InsertOneResult } from "mongodb";
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

export async function insertBusinessDay(
  doc: Document,
): Promise<InsertOneResult<Document>> {
  const col = await collection();
  return col.insertOne(doc);
}
