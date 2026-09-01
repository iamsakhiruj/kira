/**
 * `expenses` DB access. Node runtime only — see `lib/expenses.ts` for why
 * the schema lives in a separate, pure file.
 */

import { type Collection, type Document, type WithId } from "mongodb";
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

export async function ensureExpensesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ date: -1 });
  await col.createIndex({ linkedBusinessDayId: 1 });
}

const RECENT_LIMIT = 200;

/** Most recent standalone expenses, newest first. */
export async function getRecentExpenses(
  limit: number = RECENT_LIMIT,
): Promise<StoredExpense[]> {
  const col = await collection();
  const docs = await col.find({}).sort({ date: -1 }).limit(limit).toArray();
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
