"use server";

import { requireUser } from "@/lib/auth";
import { getBusinessDayById } from "@/lib/businessDays";
import {
  CorrectionRequestInputSchema,
  ApplyNoteSchema,
  RejectNoteSchema,
} from "@/lib/correctionRequests";
import {
  createCorrectionRequest,
  resolveCorrectionRequest,
} from "@/lib/correctionRequestsStore";

export type CorrectionResult = { ok: true } | { ok: false; error: string };

/**
 * Raise a correction request against a submitted or approved night report.
 *
 * Any authenticated role may raise one. Reception may only raise against a
 * report they submitted themselves — enforced server-side, not by hiding UI
 * (CLAUDE.md rule 7). Manager/owner may raise against any report.
 *
 * The business day must exist and be submitted or approved — you cannot raise
 * a correction against a report that was never submitted.
 */
export async function raiseCorrection(
  rawInput: unknown,
): Promise<CorrectionResult> {
  const user = await requireUser(); // any authenticated role

  const parsed = CorrectionRequestInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { ok: false, error: first };
  }
  const input = parsed.data;

  const day = await getBusinessDayById(input.businessDayId);
  if (!day) {
    return { ok: false, error: "That night report no longer exists." };
  }
  if (day.status !== "submitted" && day.status !== "approved") {
    return {
      ok: false,
      error:
        "Corrections can only be raised against a submitted or approved report.",
    };
  }

  // Reception may only raise against reports they themselves submitted.
  if (
    user.role === "reception" &&
    String(day.submittedBy) !== user.sub
  ) {
    return {
      ok: false,
      error: "You can only request a correction on your own reports.",
    };
  }

  await createCorrectionRequest(input, String(day.date), {
    id: user.sub,
    role: user.role,
  });

  return { ok: true };
}

/**
 * Apply or reject an open correction request. Manager or owner only.
 *
 * For a rejection the note is required — a rejection without explanation
 * leaves reception with no way forward. For an application the note is
 * optional.
 *
 * Returns a friendly message if the request was already resolved (race
 * condition / double-click) rather than throwing.
 */
export async function resolveCorrection(
  id: string,
  resolution: "applied" | "rejected",
  note: string,
): Promise<CorrectionResult> {
  const user = await requireUser("manager"); // reception → redirected, manager/owner pass

  if (resolution === "rejected") {
    const parsed = RejectNoteSchema.safeParse({ note });
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Invalid note.";
      return { ok: false, error: first };
    }
  } else {
    const parsed = ApplyNoteSchema.safeParse({ note });
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Invalid note.";
      return { ok: false, error: first };
    }
  }

  const resolved = await resolveCorrectionRequest(
    id,
    resolution,
    note,
    { id: user.sub, role: user.role },
  );

  if (!resolved) {
    return {
      ok: false,
      error: "This request was already resolved by someone else.",
    };
  }

  return { ok: true };
}
