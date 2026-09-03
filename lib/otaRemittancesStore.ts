/**
 * `otaRemittances` DB access. Node runtime only — see `lib/otaRemittances.ts`
 * for why the schema lives in a separate, pure file.
 *
 * A single insertOne, not a Mongo transaction: unlike setShares()
 * (lib/partnersStore.ts) this write never touches another collection in the
 * same operation. The optional OTA-commission expense is a separate,
 * explicitly-confirmed follow-up action (app/ota/actions.ts), not atomic
 * with recording the remittance.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import { type OtaRemittance, type OtaRemittanceInputSchema } from "./otaRemittances";

export type StoredOtaRemittance = WithId<OtaRemittance>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("otaRemittances");
}

/** Excludes soft-deleted remittances — the outstanding-balance and account
 * queries use this so a deleted remittance stops counting. */
const NOT_DELETED = { deleted: { $ne: true } };

export async function ensureOtaRemittancesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ platformId: 1, date: -1 });
  // For the accounts feature's date-range aggregation, which queries by date
  // alone — the compound index above doesn't serve that access pattern.
  await col.createIndex({ date: 1 });
}

/** All remittances ever recorded — the all-time balance computation needs
 * every one, not a date-ranged slice (see lib/otaSummary.ts). Excludes
 * soft-deleted unless includeDeleted is set (the list's "show deleted"). */
export async function getAllOtaRemittances(
  includeDeleted = false,
): Promise<StoredOtaRemittance[]> {
  const col = await collection();
  const docs = await col.find(includeDeleted ? {} : NOT_DELETED).toArray();
  return docs as StoredOtaRemittance[];
}

export async function getOtaRemittanceById(
  id: string,
): Promise<StoredOtaRemittance | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredOtaRemittance | null>;
}

/** Remittances dated within [fromDate, toDate] (inclusive) — used by the
 * accounts feature's balance calculation. Excludes soft-deleted. */
export async function getOtaRemittancesBetween(
  fromDate: string,
  toDate: string,
): Promise<StoredOtaRemittance[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: fromDate, $lte: toDate }, ...NOT_DELETED })
    .toArray();
  return docs as StoredOtaRemittance[];
}

export async function recordRemittance(
  input: z.infer<typeof OtaRemittanceInputSchema>,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: OtaRemittance = {
    ...input,
    recordedBy: actor.id,
    recordedAt: new Date(),
  };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "otaRemittances",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId.toString();
}

/** Edit a remittance (manager+). Any field; full audit; the amount moves the
 * platform's outstanding and any account balance (computed on read). */
export async function updateRemittance(
  id: string,
  input: z.infer<typeof OtaRemittanceInputSchema>,
  actor: { id: string; role: Role },
): Promise<StoredOtaRemittance | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before || before.deleted === true) return null;

  const after = (await col.findOneAndUpdate(
    { _id, deleted: { $ne: true } },
    { $set: { ...input } },
    { returnDocument: "after" },
  )) as StoredOtaRemittance | null;
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "otaRemittances",
    documentId: id,
    before,
    after,
  });
  return after;
}

/** Soft-delete a remittance (manager+). Required reason; never a hard removal. */
export async function softDeleteRemittance(
  id: string,
  reason: string,
  actor: { id: string; role: Role },
): Promise<StoredOtaRemittance | null> {
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
  )) as StoredOtaRemittance | null;
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "delete",
    collection: "otaRemittances",
    documentId: id,
    before,
    after,
    reason,
  });
  return after;
}
