/**
 * `paymentMethods` DB access. Node runtime only (imports `mongodb`) — see
 * `lib/paymentMethods.ts` for why the schema lives in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  type PaymentMethod,
  type PaymentMethodInputSchema,
  DEFAULT_PAYMENT_METHODS,
} from "./paymentMethods";

export type StoredPaymentMethod = WithId<PaymentMethod>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("paymentMethods");
}

export async function ensurePaymentMethodsIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ name: 1 }, { unique: true });
}

/** Idempotent: seeds the defaults only if the collection is empty. */
export async function ensurePaymentMethodsSeeded(): Promise<void> {
  const col = await collection();
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;
  await col.insertMany(
    DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m, active: true })),
  );
}

export async function getPaymentMethods(): Promise<StoredPaymentMethod[]> {
  const col = await collection();
  const docs = await col.find({}).sort({ displayOrder: 1 }).toArray();
  return docs as StoredPaymentMethod[];
}

export async function createPaymentMethod(
  input: z.infer<typeof PaymentMethodInputSchema>,
  actor: { id: string; role: Role },
): Promise<ObjectId> {
  const doc: PaymentMethod = { ...input, active: true, accountId: null };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "paymentMethods",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId;
}

export async function updatePaymentMethod(
  id: string,
  changes: Partial<z.infer<typeof PaymentMethodInputSchema>> & {
    active?: boolean;
  },
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid payment method id.");
  const col = await collection();
  const _id = new ObjectId(id);

  const before = await col.findOne({ _id });
  if (!before) throw new Error("That payment method no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id },
    { $set: changes },
    { returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "paymentMethods",
    documentId: id,
    before,
    after,
  });
}
