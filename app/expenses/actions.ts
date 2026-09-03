"use server";

import { requireUser } from "@/lib/auth";
import { ExpenseInputSchema } from "@/lib/expenses";
import {
  ensureExpensesIndexes,
  createExpense,
  updateExpense,
  softDeleteExpense,
} from "@/lib/expensesStore";
import { getActiveCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Re-validate an expense's references against the currently-active lists. */
async function validateRefs(
  categoryId: string,
  paymentMethodId: string,
): Promise<string | null> {
  const [categories, methods] = await Promise.all([
    getActiveCategories("expense"),
    getPaymentMethods(),
  ]);
  const validCategoryIds = new Set(categories.map((c) => c._id.toString()));
  const validMethodIds = new Set(
    methods.filter((m) => m.active).map((m) => m._id.toString()),
  );
  if (!validCategoryIds.has(categoryId)) {
    return "That category isn't valid anymore — refresh and try again.";
  }
  if (!validMethodIds.has(paymentMethodId)) {
    return "That payment method isn't valid anymore — refresh and try again.";
  }
  return null;
}

export async function addExpense(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = ExpenseInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form." };
  }

  const refError = await validateRefs(parsed.data.categoryId, parsed.data.paymentMethodId);
  if (refError) return { ok: false, error: refError };

  await ensureExpensesIndexes();
  await createExpense(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}

/** Edit an expense (manager+). Any field; full before/after audit; editing the
 * amount moves the affected account balance. */
export async function editExpense(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = ExpenseInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const refError = await validateRefs(parsed.data.categoryId, parsed.data.paymentMethodId);
  if (refError) return { ok: false, error: refError };

  const after = await updateExpense(id, parsed.data, { id: user.sub, role: user.role });
  if (!after) return { ok: false, error: "That expense no longer exists or was deleted." };
  return { ok: true };
}

/** Soft-delete an expense (manager+). Required reason; never a hard removal. */
export async function deleteExpense(id: string, reason: string): Promise<ActionResult> {
  const user = await requireUser("manager");
  if (!reason.trim()) return { ok: false, error: "Enter a reason for deleting this expense." };

  const after = await softDeleteExpense(id, reason.trim(), { id: user.sub, role: user.role });
  if (!after) return { ok: false, error: "That expense no longer exists or was already deleted." };
  return { ok: true };
}
