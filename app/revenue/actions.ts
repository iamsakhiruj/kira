"use server";

import { requireUser } from "@/lib/auth";
import { RevenueEntryInputSchema } from "@/lib/revenueEntries";
import { ensureRevenueEntriesIndexes, createRevenueEntry } from "@/lib/revenueEntriesStore";
import { getActiveCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addRevenueEntry(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = RevenueEntryInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form." };
  }

  const [categories, methods] = await Promise.all([
    getActiveCategories("revenue"),
    getPaymentMethods(),
  ]);
  const validCategoryIds = new Set(categories.map((c) => c._id.toString()));
  const validMethodIds = new Set(
    methods.filter((m) => m.active).map((m) => m._id.toString()),
  );
  if (!validCategoryIds.has(parsed.data.categoryId)) {
    return { ok: false, error: "That category isn't valid anymore — refresh and try again." };
  }
  if (!validMethodIds.has(parsed.data.paymentMethodId)) {
    return {
      ok: false,
      error: "That payment method isn't valid anymore — refresh and try again.",
    };
  }

  await ensureRevenueEntriesIndexes();
  await createRevenueEntry(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}
