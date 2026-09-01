/**
 * `categories` DB access. Node runtime only — see `lib/categories.ts` for
 * why the schema lives in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import { REVENUE_CATEGORIES, EXPENSE_CATEGORIES } from "./nightReport";
import { type Category, type CategoryInputSchema } from "./categories";

export type StoredCategory = WithId<Category>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("categories");
}

export async function ensureCategoriesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ type: 1, name: 1 }, { unique: true });
}

// Standalone-only expense categories, spec §5.2 — "everything reception
// never touches": salaries, rent, utilities, OTA commission invoices, and
// the rest of what the owner records outside the front desk.
const STANDALONE_EXPENSE_CATEGORIES = [
  "Salaries and EPF/SOCSO",
  "Rent",
  "Electricity and water",
  "Internet",
  "OTA commission",
  "Laundry contractor",
  "Licences and council fees",
  "Insurance",
  "Loan repayments",
  "Marketing",
  "Accounting fees",
  "Renovation and capital items",
];

/**
 * Idempotent: seeds only if the collection is empty. The front-desk lists
 * (`standaloneOnly: false`) are imported directly from `lib/nightReport.ts`
 * rather than retyped here, so the seed is guaranteed to match exactly what
 * reception already had before the migration to reading categories from
 * this collection — no risk of a transcription drift between the two.
 */
export async function ensureCategoriesSeeded(): Promise<void> {
  const col = await collection();
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;

  const docs: Category[] = [];
  REVENUE_CATEGORIES.forEach((name, i) =>
    docs.push({ name, type: "revenue", standaloneOnly: false, active: true, displayOrder: i }),
  );
  EXPENSE_CATEGORIES.forEach((name, i) =>
    docs.push({ name, type: "expense", standaloneOnly: false, active: true, displayOrder: i }),
  );
  STANDALONE_EXPENSE_CATEGORIES.forEach((name, i) =>
    docs.push({
      name,
      type: "expense",
      standaloneOnly: true,
      active: true,
      displayOrder: EXPENSE_CATEGORIES.length + i,
    }),
  );
  await col.insertMany(docs);
}

/** Active categories of one type, sorted for display. */
export async function getActiveCategories(
  type: "revenue" | "expense",
): Promise<StoredCategory[]> {
  const col = await collection();
  const docs = await col.find({ type, active: true }).sort({ displayOrder: 1 }).toArray();
  return docs as StoredCategory[];
}

/** All categories of one type, active and inactive, for the settings screen. */
export async function getAllCategories(type: "revenue" | "expense"): Promise<StoredCategory[]> {
  const col = await collection();
  const docs = await col.find({ type }).sort({ displayOrder: 1 }).toArray();
  return docs as StoredCategory[];
}

export async function createCategory(
  input: z.infer<typeof CategoryInputSchema>,
  actor: { id: string; role: Role },
): Promise<ObjectId> {
  const doc: Category = { ...input, active: true };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "categories",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId;
}

export async function updateCategory(
  id: string,
  changes: Partial<z.infer<typeof CategoryInputSchema>> & { active?: boolean },
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid category id.");
  const col = await collection();
  const _id = new ObjectId(id);

  const before = await col.findOne({ _id });
  if (!before) throw new Error("That category no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id },
    { $set: changes },
    { returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "categories",
    documentId: id,
    before,
    after,
  });
}
