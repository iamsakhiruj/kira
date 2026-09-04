/**
 * Partners, their effective-dated shares, and their money in/out — pure
 * schemas and the tested arithmetic. DB access lives in `lib/partnersStore.ts`.
 *
 * Two rules from the Phase 2 plan shape this file:
 *
 *  - §1 (the frozen-percentage trap): a share is never edited in place.
 *    Changing a partner's percentage CLOSES the current row (sets its
 *    `effectiveTo`) and OPENS a new one. "What were the splits in March" must
 *    stay answerable, so history cannot move. Profit allocation (2.7) will
 *    snapshot the percentage it used onto each allocation line; that is a
 *    separate collection, not built here.
 *
 *  - Percentages are stored as integer BASIS POINTS (10000 = 100.00%), never
 *    floats — the same discipline as sen for money. "Active shares total
 *    exactly 100%" is then an exact integer check (`sum === 10000`), so a
 *    33.33 / 33.33 / 33.34 split is representable and validates cleanly.
 */

import { z } from "zod";

export const PERCENT_BP_TOTAL = 10000; // 100.00% in basis points

export const TRANSACTION_DIRECTIONS = ["drawing", "injection"] as const;
export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

/**
 * Purpose classifies the withdrawal/injection (build plan §2). `salary`
 * normally belongs in payroll (Step 2.5), not here — the UI hints as much —
 * but it is kept in the enum by decision. `director_loan` is the one that
 * carries Section 140B exposure and is surfaced visibly, not just stored.
 * `capital_injection` (Phase 2 §2.11) is money the owner puts into the
 * business — the /expenses page's capital-injection entry type writes here,
 * `direction: "injection"`, never into the `expenses` collection, so it can
 * never land in an expense total.
 */
export const TRANSACTION_PURPOSES = [
  "salary",
  "dividend",
  "reimbursement",
  "loan_repayment",
  "director_loan",
  "capital_injection",
] as const;
export type TransactionPurpose = (typeof TRANSACTION_PURPOSES)[number];

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");
const nullableDateStr = dateStr.nullable();

// --- partners -------------------------------------------------------------

export const PartnerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  active: z.boolean(),
  joinedDate: dateStr,
  exitDate: nullableDateStr.default(null),
  notes: z.string().max(2000).default(""),
});
export type Partner = z.infer<typeof PartnerSchema>;

/** What the client sends to create or edit a partner. */
export const PartnerInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  active: z.boolean().default(true),
  joinedDate: dateStr,
  exitDate: nullableDateStr.default(null),
  notes: z.string().max(2000).default(""),
});

// --- shares ---------------------------------------------------------------

export const PartnerShareSchema = z.object({
  partnerId: z.string().min(1),
  percentageBp: z.number().int().min(1).max(PERCENT_BP_TOTAL),
  effectiveFrom: dateStr,
  effectiveTo: nullableDateStr.default(null),
  setBy: z.string().min(1),
  setAt: z.date(),
});
export type PartnerShare = z.infer<typeof PartnerShareSchema>;

export const ShareLineSchema = z.object({
  partnerId: z.string().min(1),
  percentageBp: z.number().int().min(1).max(PERCENT_BP_TOTAL),
});
export type ShareLine = z.infer<typeof ShareLineSchema>;

/** What the client sends to set a new active share set. */
export const ShareSetInputSchema = z.object({
  effectiveFrom: dateStr,
  lines: z.array(ShareLineSchema).min(1, "Add at least one partner's share."),
});

// --- transactions ---------------------------------------------------------

export const PartnerTransactionSchema = z.object({
  partnerId: z.string().min(1),
  date: dateStr,
  amountSen: z.number().int("Amounts are whole sen.").min(1, "Enter an amount greater than zero."),
  direction: z.enum(TRANSACTION_DIRECTIONS),
  paymentMethodId: z.string().min(1),
  purpose: z.enum(TRANSACTION_PURPOSES),
  reference: z.string().trim().max(120).default(""),
  note: z.string().max(2000).default(""),
  recordedBy: z.string().min(1),
  recordedAt: z.date(),
  // Soft delete — never a hard removal (breaks the audit trail and silently
  // changes past balances/reports). Server-set.
  deleted: z.boolean().optional(),
  deletedReason: z.string().optional(),
  deletedBy: z.string().optional(),
  deletedAt: z.date().optional(),
});
export type PartnerTransaction = z.infer<typeof PartnerTransactionSchema>;

export const PartnerTransactionInputSchema = z.object({
  partnerId: z.string().min(1),
  date: dateStr,
  amountSen: z.number().int("Amounts are whole sen.").min(1, "Enter an amount greater than zero."),
  direction: z.enum(TRANSACTION_DIRECTIONS),
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  purpose: z.enum(TRANSACTION_PURPOSES),
  reference: z.string().trim().max(120).default(""),
  note: z.string().max(2000).default(""),
});

/**
 * What the /expenses page's capital-injection form sends — direction and
 * purpose are never client input (fixed server-side to "injection" /
 * "capital_injection" in app/expenses/actions.ts), so this can't be used to
 * spoof a drawing or another purpose through that entry point.
 */
export const CapitalInjectionInputSchema = z.object({
  partnerId: z.string().min(1, "Choose a partner."),
  date: dateStr,
  amountSen: z.number().int("Amounts are whole sen.").min(1, "Enter an amount greater than zero."),
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  reference: z.string().trim().max(120).default(""),
  note: z.string().max(2000).default(""),
});

// --- pure helpers (tested) ------------------------------------------------

export interface ShareSetCheck {
  ok: boolean;
  totalBp: number;
  error?: string;
}

/** Percentage of basis points as a display string: 3333 -> "33.33". */
export function formatBp(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * A proposed active share set is valid only if every line is a positive share,
 * no partner appears twice, and the whole set totals exactly 100% (10000 bp).
 * Refuse anything else — a set that doesn't total 100 is a data-integrity bug,
 * not a UI inconvenience.
 */
export function validateShareSet(lines: ShareLine[]): ShareSetCheck {
  if (lines.length === 0) {
    return { ok: false, totalBp: 0, error: "Add at least one partner's share." };
  }
  const seen = new Set<string>();
  let totalBp = 0;
  for (const line of lines) {
    if (seen.has(line.partnerId)) {
      return { ok: false, totalBp, error: "A partner appears more than once." };
    }
    seen.add(line.partnerId);
    if (
      !Number.isInteger(line.percentageBp) ||
      line.percentageBp < 1 ||
      line.percentageBp > PERCENT_BP_TOTAL
    ) {
      return {
        ok: false,
        totalBp,
        error: "Each share must be between 0.01% and 100%.",
      };
    }
    totalBp += line.percentageBp;
  }
  if (totalBp !== PERCENT_BP_TOTAL) {
    return {
      ok: false,
      totalBp,
      error: `Active shares must total exactly 100%. They currently total ${formatBp(totalBp)}%.`,
    };
  }
  return { ok: true, totalBp };
}

/** Shares in effect on a given date. Half-open interval: a row is active when
 * effectiveFrom <= date AND (effectiveTo is null OR date < effectiveTo), so a
 * row closed on date F and its replacement opened on F don't both count on F. */
export function sharesActiveOn<
  T extends { effectiveFrom: string; effectiveTo: string | null },
>(rows: T[], date: string): T[] {
  return rows.filter(
    (r) => r.effectiveFrom <= date && (r.effectiveTo === null || date < r.effectiveTo),
  );
}

export interface TransactionTotals {
  injectionsSen: number;
  drawingsSen: number;
}

/** Sum transaction amounts by direction. */
export function summariseTransactions(
  txns: { direction: TransactionDirection; amountSen: number }[],
): TransactionTotals {
  let injectionsSen = 0;
  let drawingsSen = 0;
  for (const t of txns) {
    if (t.direction === "injection") injectionsSen += t.amountSen;
    else drawingsSen += t.amountSen;
  }
  return { injectionsSen, drawingsSen };
}

/**
 * The partner balance (build plan §3), computed never stored:
 *   allocated profit + injections − drawings.
 * Positive = profit earned but not yet taken; negative = drawn more than
 * earned (a real and useful number). `allocatedSen` is 0 until profit
 * allocation exists (Step 2.7).
 */
export function computePartnerBalanceSen(parts: {
  allocatedSen: number;
  injectionsSen: number;
  drawingsSen: number;
}): number {
  return parts.allocatedSen + parts.injectionsSen - parts.drawingsSen;
}
