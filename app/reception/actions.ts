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
} from "@/lib/businessDays";
import { recordAudit } from "@/lib/audit";
import { formatRM } from "@/lib/money";

export type SubmitResult =
  | { ok: true; date: string }
  | { ok: false; error: string };

interface SubmitPayload {
  date: string;
  report: unknown;
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
        user.role === "owner"
          ? "That date is in the future."
          : "That date is in the future, or more than 7 days ago — ask the owner to enter it.",
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

  // Recompute the variance server-side — never trust the client's figure.
  const recon = reconcile(input);
  if (
    requiresVarianceReason(recon.varianceSen, settings.varianceThresholdSen) &&
    !input.varianceReason.trim()
  ) {
    const sign = recon.varianceSen < 0 ? "short" : "over";
    return {
      ok: false,
      error: `The drawer is ${formatRM(Math.abs(recon.varianceSen))} ${sign}. Enter a reason for the difference.`,
    };
  }

  // Revenue-vs-collections reconciliation (spec §3 / CLAUDE.md rule 3) — also
  // recomputed server-side. A warning, never a block: it only demands a
  // reason, it never refuses the submission.
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
      ok: false,
      error: `Revenue is ${formatRM(Math.abs(gap.gapSen))} ${sign} what collections and receivables account for. Enter a reason for the difference.`,
    };
  }

  // Per-item expense ceiling (spec §4.5): "anything above it needs the
  // owner, not reception." A warning, same pattern as above — reception can
  // still submit, but must leave a note so the owner sees why.
  const overCeiling = input.expenses.find(
    (e) => e.amountSen > settings.expenseCeilingSen && !e.note.trim(),
  );
  if (overCeiling) {
    return {
      ok: false,
      error: `The ${formatRM(overCeiling.amountSen)} "${overCeiling.category}" expense is over the ${formatRM(settings.expenseCeilingSen)} ceiling — add a note for the owner before submitting.`,
    };
  }

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
