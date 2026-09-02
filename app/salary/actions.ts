"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  SalaryLineEditSchema,
  MarkPaidSchema,
} from "@/lib/salaryPayments";
import {
  ensureSalaryIndexes,
  generateOrRefreshDraftRun,
  updateSalaryLine,
  markLinePaid,
  createAdjustment,
  type RunSummary,
} from "@/lib/salaryStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Pick a month.");

export async function refreshRun(
  month: unknown,
): Promise<{ ok: true; summary: RunSummary } | { ok: false; error: string }> {
  const user = await requireUser("owner");
  const parsed = MonthSchema.safeParse(month);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await ensureSalaryIndexes();
    const summary = await generateOrRefreshDraftRun(parsed.data, {
      id: user.sub,
      role: user.role,
    });
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateLine(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = SalaryLineEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the line." };
  }
  try {
    await updateSalaryLine(
      id,
      {
        advanceRepaymentSen: parsed.data.advanceRepaymentSen,
        otherDeductionSen: parsed.data.otherDeductionSen,
        otherDeductionNote: parsed.data.otherDeductionNote,
        statutoryDeductionSen: parsed.data.statutoryDeductionSen,
        paymentMethodId: parsed.data.paymentMethodId,
      },
      { id: user.sub, role: user.role },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function markPaid(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = MarkPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  try {
    const done = await markLinePaid(id, parsed.data, {
      id: user.sub,
      role: user.role,
    });
    if (!done) return { ok: false, error: "That line was already paid." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function adjustLine(id: string): Promise<ActionResult> {
  const user = await requireUser("owner");
  try {
    await createAdjustment(id, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
