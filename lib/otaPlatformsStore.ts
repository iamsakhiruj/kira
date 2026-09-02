/**
 * `otaPlatforms` DB access. Node runtime only (imports `mongodb`) — see
 * `lib/otaPlatforms.ts` for why the schema lives in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  type OtaPlatform,
  type OtaPlatformInputSchema,
  DEFAULT_OTA_PLATFORMS,
} from "./otaPlatforms";

export type StoredOtaPlatform = WithId<OtaPlatform>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("otaPlatforms");
}

export async function ensureOtaPlatformsIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ name: 1 }, { unique: true });
}

/** Idempotent: seeds the defaults only if the collection is empty. */
export async function ensureOtaPlatformsSeeded(): Promise<void> {
  const col = await collection();
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;
  await col.insertMany(
    DEFAULT_OTA_PLATFORMS.map((p) => ({ ...p, active: true })),
  );
}

export async function getOtaPlatforms(): Promise<StoredOtaPlatform[]> {
  const col = await collection();
  const docs = await col.find({}).sort({ displayOrder: 1 }).toArray();
  return docs as StoredOtaPlatform[];
}

/** Active platforms only, for the night-report picker. */
export async function getActiveOtaPlatforms(): Promise<StoredOtaPlatform[]> {
  const col = await collection();
  const docs = await col
    .find({ active: true })
    .sort({ displayOrder: 1 })
    .toArray();
  return docs as StoredOtaPlatform[];
}

export async function createOtaPlatform(
  input: z.infer<typeof OtaPlatformInputSchema>,
  actor: { id: string; role: Role },
): Promise<ObjectId> {
  const doc: OtaPlatform = { ...input, active: true };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "otaPlatforms",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId;
}

export async function updateOtaPlatform(
  id: string,
  changes: Partial<z.infer<typeof OtaPlatformInputSchema>> & {
    active?: boolean;
  },
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid OTA platform id.");
  const col = await collection();
  const _id = new ObjectId(id);

  const before = await col.findOne({ _id });
  if (!before) throw new Error("That OTA platform no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id },
    { $set: changes },
    { returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "otaPlatforms",
    documentId: id,
    before,
    after,
  });
}
