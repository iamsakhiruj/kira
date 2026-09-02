/**
 * `correctionRequests` DB access. Node runtime only — schemas in
 * `lib/correctionRequests.ts`.
 *
 * The core rule: applying a correction does NOT edit the `businessDays`
 * document. The correctionRequests document IS the adjustment — applying it
 * sets status "applied" and records the resolution. The original night report
 * is never mutated (CLAUDE.md rule 5).
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  CorrectionRequestSchema,
  type CorrectionRequest,
  type CorrectionRequestInput,
} from "./correctionRequests";

export type StoredCorrectionRequest = WithId<CorrectionRequest>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("correctionRequests");
}

/** Create supporting indexes. Idempotent — safe to call repeatedly. */
export async function ensureCorrectionRequestIndexes(): Promise<void> {
  const col = await collection();
  await Promise.all([
    col.createIndex({ businessDayId: 1 }),
    col.createIndex({ requestedBy: 1 }),
    col.createIndex({ status: 1 }),
  ]);
}

/**
 * Insert a new correction request. Status starts at "open". Audit-logged
 * (action: "create", before: null, after: the inserted doc).
 *
 * Returns the new document's _id as a string.
 */
export async function createCorrectionRequest(
  input: CorrectionRequestInput,
  businessDate: string,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc = CorrectionRequestSchema.parse({
    businessDayId: input.businessDayId,
    businessDate,
    requestedBy: actor.id,
    requestedAt: new Date(),
    whatNeedsCorrecting: input.whatNeedsCorrecting,
    whatItShouldBe: input.whatItShouldBe,
    reason: input.reason,
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: "",
  });

  const col = await collection();
  const res = await col.insertOne(doc);
  const id = res.insertedId.toString();

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "correctionRequests",
    documentId: id,
    before: null,
    after: doc,
  });

  return id;
}

/** All open requests, oldest first (oldest = most urgent). */
export async function getOpenCorrectionRequests(): Promise<
  StoredCorrectionRequest[]
> {
  const col = await collection();
  return col
    .find({ status: "open" })
    .sort({ requestedAt: 1 })
    .toArray() as Promise<StoredCorrectionRequest[]>;
}

/** All requests raised by a specific user, newest first. */
export async function getCorrectionRequestsByRequester(
  userId: string,
): Promise<StoredCorrectionRequest[]> {
  const col = await collection();
  return col
    .find({ requestedBy: userId })
    .sort({ requestedAt: -1 })
    .toArray() as Promise<StoredCorrectionRequest[]>;
}

/** All requests for a specific business day (any status). */
export async function getCorrectionRequestsForBusinessDay(
  businessDayId: string,
): Promise<StoredCorrectionRequest[]> {
  const col = await collection();
  return col
    .find({ businessDayId })
    .sort({ requestedAt: -1 })
    .toArray() as Promise<StoredCorrectionRequest[]>;
}

/**
 * Resolve an open correction request. Guarded on status "open" so two
 * managers resolving at the same moment can't both succeed — the second write
 * matches nothing and this function returns false.
 *
 * Audit action:
 *  - "applied" → "correct"
 *  - "rejected" → "update"
 *
 * Returns true if the resolution was recorded, false if the request was
 * already resolved (race condition / double-click).
 */
export async function resolveCorrectionRequest(
  id: string,
  resolution: "applied" | "rejected",
  note: string,
  actor: { id: string; role: Role },
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const col = await collection();

  const before = await col.findOne({ _id: new ObjectId(id) });
  if (!before) return false;

  const now = new Date();
  const after = await col.findOneAndUpdate(
    { _id: new ObjectId(id), status: "open" },
    {
      $set: {
        status: resolution,
        resolvedBy: actor.id,
        resolvedAt: now,
        resolutionNote: note,
      },
    },
    { returnDocument: "after" },
  );

  if (!after) {
    // Already resolved between the read and the write — race condition.
    return false;
  }

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: resolution === "applied" ? "correct" : "update",
    collection: "correctionRequests",
    documentId: id,
    before,
    after,
    reason: note || undefined,
  });

  return true;
}
