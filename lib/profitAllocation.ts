/**
 * Profit allocation — pure schema and the split arithmetic. DB access is in
 * `lib/profitAllocationStore.ts`.
 *
 * THE RULE (build plan §1): when a month is allocated, each partner's
 * percentage is COPIED onto the allocation line. A locked allocation is only
 * ever read from its own stored lines — never from `partnerShares` live — so
 * changing a share in June cannot rewrite March. This module holds the
 * snapshot shape (`percentageBasisPoints` on each line) and the arithmetic;
 * the store enforces that a locked allocation is immutable and that
 * corrections are new adjustment allocations.
 *
 * Sdn Bhd (build plan §2): the figure produced at month close is a NOTIONAL
 * management share, not a declared dividend. A dividend is a separate, less
 * frequent event paid from post-tax profit. Nothing here implies money is due
 * on close — the UI labels it accordingly.
 */

import { z } from "zod";

export const ALLOCATION_STATUSES = ["draft", "locked"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

const monthStr = z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM.");
const senInt = z.number().int("Amounts are stored as whole sen.");

export const AllocationLineSchema = z.object({
  partnerId: z.string().min(1),
  partnerName: z.string().min(1),
  /** The percentage USED AT THE TIME, copied from the active share set and
   * frozen. Never re-read from partnerShares for a locked allocation. */
  percentageBasisPoints: z.number().int().min(0).max(10000),
  amountSen: senInt, // signed — a loss month allocates negative shares
});
export type AllocationLine = z.infer<typeof AllocationLineSchema>;

export const ProfitAllocationSchema = z.object({
  month: monthStr,
  netProfitSen: senInt, // revenue − expenses; signed
  revenueSen: senInt.min(0),
  expenseSen: senInt.min(0),
  status: z.enum(ALLOCATION_STATUSES),
  lines: z.array(AllocationLineSchema),
  adjustmentOf: z.string().nullable().default(null),
  allocatedBy: z.string().min(1),
  allocatedAt: z.date(),
  lockedBy: z.string().nullable().default(null),
  lockedAt: z.date().nullable().default(null),
});
export type ProfitAllocation = z.infer<typeof ProfitAllocationSchema>;

export interface ShareInput {
  partnerId: string;
  percentageBp: number;
}
export interface AllocatedAmount {
  partnerId: string;
  percentageBp: number;
  amountSen: number;
}

/**
 * Split `netProfitSen` across partners by their basis-point shares so the
 * parts sum EXACTLY to the net profit — the largest-remainder (Hamilton)
 * method, in pure integer arithmetic:
 *
 *   1. productᵢ  = netProfit × bpᵢ
 *   2. floorᵢ    = floor(productᵢ / 10000)   (toward −∞, so a loss works too)
 *   3. remainderᵢ = productᵢ − floorᵢ × 10000        ∈ [0, 10000)
 *   4. R = netProfit − Σfloorᵢ   (leftover sen; provably an integer in [0, n))
 *   5. give +1 sen to the R partners with the largest remainder, ties broken
 *      by partnerId ascending (deterministic).
 *
 * Σ result = netProfit exactly; every partner is within one sen of their exact
 * share. No floating point anywhere.
 */
export function allocateProfit(
  netProfitSen: number,
  shares: ShareInput[],
): AllocatedAmount[] {
  if (!Number.isInteger(netProfitSen)) {
    throw new Error("Net profit must be a whole number of sen.");
  }
  if (shares.length === 0) {
    throw new Error("No active share set to allocate against.");
  }
  const totalBp = shares.reduce((s, x) => s + x.percentageBp, 0);
  if (totalBp !== 10000) {
    throw new Error(
      `Shares must total exactly 100% to allocate (got ${totalBp} basis points).`,
    );
  }

  const rows = shares.map((s) => {
    const product = netProfitSen * s.percentageBp;
    const floor = Math.floor(product / 10000);
    const remainder = product - floor * 10000; // 0..9999
    return { ...s, floor, remainder };
  });

  const distributed = rows.reduce((sum, r) => sum + r.floor, 0);
  let leftover = netProfitSen - distributed; // integer in [0, shares.length)

  // Largest remainder first; deterministic tie-break by partnerId.
  const order = [...rows].sort(
    (a, b) =>
      b.remainder - a.remainder || (a.partnerId < b.partnerId ? -1 : 1),
  );
  const bonus = new Set<string>();
  for (const r of order) {
    if (leftover <= 0) break;
    bonus.add(r.partnerId);
    leftover--;
  }

  return rows.map((r) => ({
    partnerId: r.partnerId,
    percentageBp: r.percentageBp,
    amountSen: r.floor + (bonus.has(r.partnerId) ? 1 : 0),
  }));
}

/**
 * Sum each partner's allocated profit across LOCKED allocations, for the
 * partner balance. An adjustment replaces the allocation it references, so a
 * locked allocation that has been superseded by a locked adjustment is not
 * counted — only the effective (latest) one in each chain. Draft allocations
 * never count toward a balance. Pure so the supersede rule is testable.
 */
export function sumEffectiveLockedByPartner(
  allocations: {
    id: string;
    status: AllocationStatus;
    adjustmentOf: string | null;
    lines: { partnerId: string; amountSen: number }[];
  }[],
): Map<string, number> {
  const locked = allocations.filter((a) => a.status === "locked");
  const superseded = new Set(
    locked.map((a) => a.adjustmentOf).filter((x): x is string => x != null),
  );
  const out = new Map<string, number>();
  for (const a of locked) {
    if (superseded.has(a.id)) continue; // replaced by a locked adjustment
    for (const l of a.lines) {
      out.set(l.partnerId, (out.get(l.partnerId) ?? 0) + l.amountSen);
    }
  }
  return out;
}

/** Last calendar day of a "YYYY-MM" month as "YYYY-MM-DD" (UTC, so no
 * timezone can shift the day count). The share set frozen for a month is the
 * one active on this date — the "as of close" snapshot. */
export function monthEndDate(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`Invalid month "${month}", expected YYYY-MM.`);
  const year = Number(m[1]);
  const monthIndex = Number(m[2]);
  if (monthIndex < 1 || monthIndex > 12) throw new Error(`Invalid month "${month}".`);
  const day = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${String(day).padStart(2, "0")}`;
}
