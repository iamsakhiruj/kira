/**
 * `expenses` DB access. Node runtime only — see `lib/expenses.ts` for why
 * the schema lives in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import { type Expense, type ExpenseInputSchema } from "./expenses";

export type StoredExpense = WithId<Expense>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("expenses");
}

/** Excludes soft-deleted expenses — used by every balance/report query. */
const NOT_DELETED = { deleted: { $ne: true } };

export async function ensureExpensesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ date: -1 });
  await col.createIndex({ linkedBusinessDayId: 1 });
}

const RECENT_LIMIT = 200;

/** Most recent standalone expenses, newest first. Excludes soft-deleted unless
 * includeDeleted is set (the list's "show deleted" toggle). */
export async function getRecentExpenses(
  limit: number = RECENT_LIMIT,
  includeDeleted = false,
): Promise<StoredExpense[]> {
  const col = await collection();
  const docs = await col
    .find(includeDeleted ? {} : NOT_DELETED)
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
  return docs as StoredExpense[];
}

export async function getExpenseById(id: string): Promise<StoredExpense | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredExpense | null>;
}

/** Standalone expenses in a calendar month ("YYYY-MM"). Lexicographic range
 * on the indexed `date` string. Excludes soft-deleted. */
export async function getExpensesForMonth(
  month: string,
): Promise<StoredExpense[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: `${month}-01`, $lte: `${month}-31` }, ...NOT_DELETED })
    .toArray();
  return docs as StoredExpense[];
}

/** Standalone expenses between two dates (inclusive). Excludes soft-deleted —
 * so balances and reports never count a deleted expense. */
export async function getExpensesBetween(
  fromDate: string,
  toDate: string,
): Promise<StoredExpense[]> {
  const col = await collection();
  const docs = await col
    .find({ date: { $gte: fromDate, $lte: toDate }, ...NOT_DELETED })
    .toArray();
  return docs as StoredExpense[];
}

export async function createExpense(
  input: z.infer<typeof ExpenseInputSchema>,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: Expense = {
    ...input,
    paidBy: actor.id,
    linkedBusinessDayId: null,
  };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "expenses",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId.toString();
}

/** Edit an expense's fields. Editing the amount moves any account balance it
 * affects (balances are computed on read). Full before/after audit. Returns
 * the updated doc, or null if it's gone or already deleted. */
export async function updateExpense(
  id: string,
  input: z.infer<typeof ExpenseInputSchema>,
  actor: { id: string; role: Role },
): Promise<StoredExpense | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before || before.deleted === true) return null;

  const after = (await col.findOneAndUpdate(
    { _id, deleted: { $ne: true } },
    { $set: { ...input } },
    { returnDocument: "after" },
  )) as StoredExpense | null;
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "expenses",
    documentId: id,
    before,
    after,
  });
  return after;
}

/** Soft-delete: never a hard removal. Required reason; stays in the DB,
 * excluded from balances/reports and hidden from the list by default. */
export async function softDeleteExpense(
  id: string,
  reason: string,
  actor: { id: string; role: Role },
): Promise<StoredExpense | null> {
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
  )) as StoredExpense | null;
  if (!after) return null;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "delete",
    collection: "expenses",
    documentId: id,
    before,
    after,
    reason,
  });
  return after;
}
