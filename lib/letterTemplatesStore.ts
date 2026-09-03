/**
 * `letterTemplates` DB access. Node runtime only; the schema is in
 * lib/bookings.ts. A named, reusable set of reservation-letter choices —
 * "Visa application", "Company booking", "Standard" (brief §3). Manager+
 * create and edit. Never hard-deleted — same active:false pattern as
 * paymentMethods / otaPlatforms, so a booking that stored a templateId keeps
 * resolving.
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
import type { LetterTemplateInput } from "./bookings";

export type StoredLetterTemplate = WithId<Document>;

async function collection(): Promise<Collection<Document>> {
  return (await getDb()).collection("letterTemplates");
}

export async function ensureLetterTemplateIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ name: 1 }, { unique: true });
}

export async function listLetterTemplates(): Promise<StoredLetterTemplate[]> {
  const col = await collection();
  return col.find({}).sort({ name: 1 }).toArray();
}

/** Active templates only — the picker on the letter screen. */
export async function getActiveLetterTemplates(): Promise<
  StoredLetterTemplate[]
> {
  const col = await collection();
  return col.find({ active: true }).sort({ name: 1 }).toArray();
}

export async function getLetterTemplate(
  id: string,
): Promise<StoredLetterTemplate | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function createLetterTemplate(
  input: LetterTemplateInput,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc = { ...input, active: true };
  const col = await collection();
  const res = await col.insertOne(doc);
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "letterTemplates",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });
  return res.insertedId.toString();
}

export async function updateLetterTemplate(
  id: string,
  changes: Partial<LetterTemplateInput> & { active?: boolean },
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid template id.");
  const _id = new ObjectId(id);
  const col = await collection();
  const before = await col.findOne({ _id });
  if (!before) throw new Error("That template no longer exists.");
  const after = await col.findOneAndUpdate(
    { _id },
    { $set: changes },
    { returnDocument: "after" },
  );
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "letterTemplates",
    documentId: id,
    before,
    after,
  });
}
