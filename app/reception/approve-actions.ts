"use server";

import { requireUser } from "@/lib/auth";
import { approveBusinessDay, getBusinessDayById } from "@/lib/businessDays";
import { recordAudit } from "@/lib/audit";

export type ApproveResult = { ok: true } | { ok: false; error: string };

/**
 * Approve a submitted night report. Manager or owner (Phase 2 §4: "Approve
 * a day" is not owner-only). CLAUDE.md rule 5: once approved, a day is
 * immutable — this is the transition into that state, not an edit of its
 * content. A self-approval (same user submitted and approved) is allowed,
 * not blocked (a small hotel's owner covers shifts) — it's surfaced instead,
 * via isSelfApproved() in the queue.
 */
export async function approveNightReport(
  businessDayId: string,
): Promise<ApproveResult> {
  const user = await requireUser("manager");

  const before = await getBusinessDayById(businessDayId);
  if (!before) {
    return { ok: false, error: "That night report no longer exists." };
  }
  if (before.status !== "submitted") {
    return {
      ok: false,
      error: `This day is already ${before.status}, not awaiting approval.`,
    };
  }

  const after = await approveBusinessDay(businessDayId, user.sub, new Date());
  if (!after) {
    // Someone else approved it between the read above and this write.
    return {
      ok: false,
      error: "This day was just approved by someone else.",
    };
  }

  await recordAudit({
    actorId: user.sub,
    actorRole: user.role,
    action: "approve",
    collection: "businessDays",
    documentId: businessDayId,
    before,
    after,
  });

  return { ok: true };
}
