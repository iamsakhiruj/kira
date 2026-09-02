"use server";

import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor, canSubmitDate } from "@/lib/businessDate";
import {
  NightReportInputSchema,
  reconcile,
  requiresVarianceReason,
  revenueGap,
  totalRevenueSen,
} from "@/lib/nightReport";
import {
  ensureBusinessDaysIndexes,
  insertBusinessDay,
  getBusinessDayById,
  updateSubmittedBusinessDay,
} from "@/lib/businessDays";
import { getActiveCategories } from "@/lib/categoriesStore";
import { recordAudit } from "@/lib/audit";
import { formatRM } from "@/lib/money";
import type { PropertySettings } from "@/lib/settings";
import type { NightReportInput, Reconciliation, RevenueGap } from "@/lib/nightReport";

export type SubmitResult =
  | { ok: true; date: string }
  | { ok: false; error: string };

interface SubmitPayload {
  date: string;
  report: unknown;
}

/**
 * The figure checks shared by submit and edit: variance recomputed server-side
 * (reason required past tolerance), the revenue-vs-collections gap (reason
 * required past tolerance), category names still valid + not standalone-only,
 * and the per-item expense ceiling (note required). Returns the recomputed
 * reconciliation and gap on success, or a single actionable error. Keeping
 * this in one place is why an owner's edit can never validate differently from
 * the original submission.
 */
async function validateFigures(
  input: NightReportInput,
  settings: PropertySettings,
): Promise<{ error: string } | { recon: Reconciliation; gap: RevenueGap }> {
  const recon = reconcile(input);
  if (
    requiresVarianceReason(recon.varianceSen, settings.varianceThresholdSen) &&
    !input.varianceReason.trim()
  ) {
    const sign = recon.varianceSen < 0 ? "short" : "over";
    return {
      error: `The drawer is ${formatRM(Math.abs(recon.varianceSen))} ${sign}. Enter a reason for the difference.`,
    };
  }

  const gap = revenueGap({
    totalRevenueSen: totalRevenueSen(input.rooms.revenueSen, input.revenueLines),
    collections: input.collections,
  });
  if (
    requiresVarianceReason(gap.gapSen, settings.revenueGapThresholdSen) &&
    !input.revenueGapReason.trim()
  ) {
    const sign = gap.gapSen < 0 ? "under" : "over";
    return {
      error: `Revenue is ${formatRM(Math.abs(gap.gapSen))} ${sign} what collections and receivables account for. Enter a reason for the difference.`,
    };
  }

  const [activeRevenueCats, activeExpenseCats] = await Promise.all([
    getActiveCategories("revenue"),
    getActiveCategories("expense"),
  ]);
  const validRevenueNames = new Set(
    activeRevenueCats.filter((c) => !c.standaloneOnly).map((c) => c.name),
  );
  const validExpenseNames = new Set(
    activeExpenseCats.filter((c) => !c.standaloneOnly).map((c) => c.name),
  );
  const badRevenueLine = input.revenueLines.find(
    (l) => !validRevenueNames.has(l.category),
  );
  if (badRevenueLine) {
    return {
      error: `"${badRevenueLine.category}" isn't a valid revenue category — refresh the page and try again.`,
    };
  }
  const badExpenseLine = input.expenses.find(
    (e) => !validExpenseNames.has(e.category),
  );
  if (badExpenseLine) {
    return {
      error: `"${badExpenseLine.category}" isn't a valid expense category — refresh the page and try again.`,
    };
  }

  const overCeiling = input.expenses.find(
    (e) => e.amountSen > settings.expenseCeilingSen && !e.note.trim(),
  );
  if (overCeiling) {
    return {
      error: `The ${formatRM(overCeiling.amountSen)} "${overCeiling.category}" expense is over the ${formatRM(settings.expenseCeilingSen)} ceiling — add a note.`,
    };
  }

  return { recon, gap };
}

export async function submitNightReport(
  payload: SubmitPayload,
): Promise<SubmitResult> {
  const user = await requireUser(); // reception or owner may submit

  const parsed = NightReportInputSchema.safeParse(payload?.report);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? ` (${issue.path.join(".")})` : "";
    return {
      ok: false,
      error: issue ? `${issue.message}${where}` : "Please check the form.",
    };
  }
  const input = parsed.data;

  // The business date is decided by the server; the client's requested date
  // is only ever a request, validated against the caller's own role.
  // Reception: today or the 6 days before it. Owner: any past date. Nobody:
  // a future date.
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  if (!canSubmitDate(payload.date, current, user.role)) {
    return {
      ok: false,
      error:
        user.role === "reception"
          ? "That date is in the future, or more than 7 days ago — ask the manager or owner to enter it."
          : "That date is in the future.",
    };
  }
  const date = payload.date;
  const enteredLate = date !== current;
  if (enteredLate && !input.enteredLateReason.trim()) {
    return {
      ok: false,
      error: `This report is for ${date}, not today — enter a short reason it's being entered late.`,
    };
  }

  // Recompute variance and the revenue gap server-side, validate categories
  // and the expense ceiling — never trust the client's figures. Shared with
  // editNightReport so an edit validates identically to the original submit.
  const checked = await validateFigures(input, settings);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { recon, gap } = checked;

  const now = new Date();
  const doc = {
    date,
    status: "submitted" as const,
    rooms: input.rooms,
    revenueLines: input.revenueLines,
    collections: input.collections,
    expenses: input.expenses.map((e) => ({ ...e, enteredBy: user.sub })),
    cash: {
      openingFloatSen: input.cash.openingFloatSen,
      bankedInSen: input.cash.bankedInSen,
      countedSen: input.cash.countedSen,
      varianceSen: recon.varianceSen,
      varianceReason: input.varianceReason.trim(),
    },
    revenueGapSen: gap.gapSen,
    revenueGapReason: input.revenueGapReason.trim(),
    enteredLate,
    enteredLateReason: enteredLate ? input.enteredLateReason.trim() : "",
    remarks: input.remarks.trim(),
    submittedBy: user.sub,
    submittedAt: now,
    approvedBy: null,
    approvedAt: null,
  };

  try {
    await ensureBusinessDaysIndexes();
    const res = await insertBusinessDay(doc);
    await recordAudit({
      actorId: user.sub,
      actorRole: user.role,
      action: "create",
      collection: "businessDays",
      documentId: res.insertedId.toString(),
      before: null,
      after: doc,
    });
    return { ok: true, date };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return {
        ok: false,
        error: `A report for ${date} has already been submitted. Ask the owner if it needs a correction.`,
      };
    }
    throw err;
  }
}

/**
 * Edit a still-submitted report's figures before approval. Owner/manager only
 * (reception raises a correction request instead). Only while status is
 * "submitted" — once approved it's locked (CLAUDE.md rule 5), guarded both by
 * the status check here and by the filter in updateSubmittedBusinessDay.
 *
 * The figures are re-validated and variance/gap recomputed server-side exactly
 * as on submit (shared validateFigures). date, status, submittedBy/At and the
 * approval fields are never touched; editedBy/editedAt are stamped and the
 * whole before/after is audit-logged.
 */
export async function editNightReport(
  id: string,
  report: unknown,
): Promise<SubmitResult> {
  const user = await requireUser("manager"); // reception → redirected; not allowed

  const parsed = NightReportInputSchema.safeParse(report);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? ` (${issue.path.join(".")})` : "";
    return {
      ok: false,
      error: issue ? `${issue.message}${where}` : "Please check the form.",
    };
  }
  const input = parsed.data;

  const before = await getBusinessDayById(id);
  if (!before) return { ok: false, error: "That report no longer exists." };
  if (before.status !== "submitted") {
    return {
      ok: false,
      error: `This day is ${before.status} and can no longer be edited.`,
    };
  }

  const settings = await getSettings();
  const checked = await validateFigures(input, settings);
  if ("error" in checked) return { ok: false, error: checked.error };
  const { recon, gap } = checked;

  const now = new Date();
  const set = {
    rooms: input.rooms,
    revenueLines: input.revenueLines,
    collections: input.collections,
    expenses: input.expenses.map((e) => ({ ...e, enteredBy: user.sub })),
    cash: {
      openingFloatSen: input.cash.openingFloatSen,
      bankedInSen: input.cash.bankedInSen,
      countedSen: input.cash.countedSen,
      varianceSen: recon.varianceSen,
      varianceReason: input.varianceReason.trim(),
    },
    revenueGapSen: gap.gapSen,
    revenueGapReason: input.revenueGapReason.trim(),
    remarks: input.remarks.trim(),
    editedBy: user.sub,
    editedAt: now,
  };

  const after = await updateSubmittedBusinessDay(id, set);
  if (!after) {
    // Approved between the read above and this write — immutability holds.
    return {
      ok: false,
      error: "This day was just approved and can no longer be edited.",
    };
  }

  await recordAudit({
    actorId: user.sub,
    actorRole: user.role,
    action: "update",
    collection: "businessDays",
    documentId: id,
    before,
    after,
    reason: "edited before approval",
  });

  return { ok: true, date: String(before.date) };
}
