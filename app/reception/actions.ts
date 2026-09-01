"use server";

import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor, previousBusinessDate } from "@/lib/businessDate";
import {
  NightReportInputSchema,
  reconcile,
  requiresVarianceReason,
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
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }
  const input = parsed.data;

  // The business date is decided by the server. The client may only ask for
  // one of the two legal dates: the current business day or the one before.
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  const previous = previousBusinessDate(current);
  if (payload.date !== current && payload.date !== previous) {
    return {
      ok: false,
      error: "You can only submit tonight's report or yesterday's.",
    };
  }
  const date = payload.date;

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
      after: { date, status: "submitted", varianceSen: recon.varianceSen },
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
