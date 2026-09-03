"use server";

import { requireUser } from "@/lib/auth";
import { RevenueEntryInputSchema } from "@/lib/revenueEntries";
import {
  ensureRevenueEntriesIndexes,
  createRevenueEntry,
  updateRevenueEntry,
  softDeleteRevenueEntry,
} from "@/lib/revenueEntriesStore";
import { getActiveCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Validate a revenue entry's references against the currently-active lists. */
async function validateRefs(
  categoryId: string,
  paymentMethodId: string,
): Promise<string | null> {
  const [categories, methods] = await Promise.all([
    getActiveCategories("revenue"),
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

export async function addRevenueEntry(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = RevenueEntryInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form." };
  }

  const refError = await validateRefs(parsed.data.categoryId, parsed.data.paymentMethodId);
  if (refError) return { ok: false, error: refError };

  await ensureRevenueEntriesIndexes();
  await createRevenueEntry(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}

/** Edit an entry (manager+, same as creating). Any field; full before/after
 * audit; editing the amount moves the affected account balance. */
export async function editRevenueEntry(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = RevenueEntryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const refError = await validateRefs(parsed.data.categoryId, parsed.data.paymentMethodId);
  if (refError) return { ok: false, error: refError };

  const after = await updateRevenueEntry(id, parsed.data, { id: user.sub, role: user.role });
  if (!after) return { ok: false, error: "That entry no longer exists or was deleted." };
  return { ok: true };
}

/** Soft-delete an entry (manager+). Required reason; never a hard removal. */
export async function deleteRevenueEntry(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  if (!reason.trim()) return { ok: false, error: "Enter a reason for deleting this entry." };

  const after = await softDeleteRevenueEntry(id, reason.trim(), { id: user.sub, role: user.role });
  if (!after) return { ok: false, error: "That entry no longer exists or was already deleted." };
  return { ok: true };
}
