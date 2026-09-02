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

import { type Collection, type Document, type WithId } from "mongodb";
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

export async function ensureOtaRemittancesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ platformId: 1, date: -1 });
  // For the accounts feature's date-range aggregation, which queries by date
  // alone — the compound index above doesn't serve that access pattern.
  await col.createIndex({ date: 1 });
}

/** All remittances ever recorded — the all-time balance computation needs
 * every one, not a date-ranged slice (see lib/otaSummary.ts). */
export async function getAllOtaRemittances(): Promise<StoredOtaRemittance[]> {
  const col = await collection();
  const docs = await col.find({}).toArray();
  return docs as StoredOtaRemittance[];
}

/** Remittances dated within [fromDate, toDate] (inclusive) — used by the
 * accounts feature's balance calculation. Unlike getAllOtaRemittances()
 * (the all-time outstanding-balance view), this is scoped to a period. */
export async function getOtaRemittancesBetween(
  fromDate: string,
  toDate: string,
): Promise<StoredOtaRemittance[]> {
  const col = await collection();
  const docs = await col.find({ date: { $gte: fromDate, $lte: toDate } }).toArray();
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
