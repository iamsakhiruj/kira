"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { OtaRemittanceInputSchema } from "@/lib/otaRemittances";
import {
  ensureOtaRemittancesIndexes,
  recordRemittance,
} from "@/lib/otaRemittancesStore";
import { getActiveCategories } from "@/lib/categoriesStore";
import { createExpense } from "@/lib/expensesStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function recordOtaRemittance(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = OtaRemittanceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  await ensureOtaRemittancesIndexes();
  await recordRemittance(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}

const CommissionExpenseInputSchema = z.object({
  platformName: z.string().min(1),
  amountSen: z.number().int().min(1, "Enter an amount greater than zero."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  note: z.string().max(500).default(""),
});

/**
 * Records the commission shortfall from a remittance as a standalone
 * expense — explicitly confirmed by the owner/manager in app/ota/ota-client.tsx,
 * never posted automatically alongside the remittance itself (see
 * lib/otaRemittancesStore.ts's comment on why there's no shared transaction).
 */
export async function recordOtaCommissionExpense(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = CommissionExpenseInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const expenseCategories = await getActiveCategories("expense");
  const commissionCategory = expenseCategories.find((c) => c.name === "OTA commission");
  if (!commissionCategory) {
    return {
      ok: false,
      error: `The "OTA commission" category is missing — check Settings > Categories.`,
    };
  }

  await createExpense(
    {
      date: parsed.data.date,
      categoryId: commissionCategory._id.toString(),
      amountSen: parsed.data.amountSen,
      paymentMethodId: parsed.data.paymentMethodId,
      paidTo: parsed.data.platformName,
      capitalOrOperating: "operating",
      reference: `OTA commission — ${parsed.data.platformName}`,
      note: parsed.data.note,
    },
    { id: user.sub, role: user.role },
  );

  return { ok: true };
}
