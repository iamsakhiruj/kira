/**
 * The night report — one document per business day in `businessDays`.
 *
 * Money is integer sen everywhere (`...Sen`). Revenue, collections and
 * receivables are kept separate (CLAUDE.md rule 3): a room sold to a monthly
 * guest is revenue today but cash next month, a prepaid OTA booking is revenue
 * today and no cash at the desk. The schema captures all three; it never
 * collapses them into one figure.
 *
 * `reconcile()` is the cash-drawer calculation and is unit-tested — it is the
 * number that makes the whole system worth running.
 */

import { z } from "zod";

/**
 * These two lists are no longer used for schema validation (see
 * RevenueLineSchema / ExpenseLineSchema below) — categories are now
 * DB-editable via the `categories` collection (`lib/categoriesStore.ts`,
 * Phase 2 §2.3). They're kept here purely as the seed-data source, so the
 * initial `categories` documents are guaranteed to match exactly what
 * reception had before the migration, with no risk of retyping the list a
 * second time somewhere else and drifting.
 */
export const REVENUE_CATEGORIES = [
  "Food & beverage",
  "Laundry",
  "Hall / function room",
  "Parking",
  "Late checkout",
  "Extra bed",
  "Damages recovered",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Guest supplies",
  "Cleaning materials",
  "Minor repairs",
  "Transport",
  "Staff meals",
  "F&B cost of sales",
  "Kitchen purchases",
  "Stationery",
  "Water / gas top-up",
  "Miscellaneous",
] as const;

export const PAID_BY = ["cash", "card"] as const;

export const BUSINESS_DAY_STATUSES = [
  "submitted",
  "approved",
  "queried",
] as const;

const senInt = z.number().int("Amounts are stored as whole sen.");
const nonNegSen = senInt.min(0, "Amount cannot be negative.");
const count = z.number().int().min(0);

// Category is validated against the live `categories` collection at submit
// time (submitNightReport in app/reception/actions.ts), not a compile-time
// enum — the list is DB-editable now. The shape stored on the document is
// unchanged (still a plain name string), so no historical businessDays
// document needs migrating.
const categoryName = z.string().trim().min(1, "Choose a category.").max(60);

export const RevenueLineSchema = z.object({
  category: categoryName,
  amountSen: nonNegSen,
  note: z.string().max(200).default(""),
});

export const ExpenseLineSchema = z.object({
  category: categoryName,
  amountSen: nonNegSen,
  paidTo: z.string().max(120).default(""),
  paidBy: z.enum(PAID_BY),
  note: z.string().max(200).default(""),
  // Matches the canonical businessDays shape in CLAUDE.md. No upload
  // mechanism exists yet (spec §4.5's optional receipt photo) — this just
  // keeps the schema from drifting from the documented shape until one does.
  receiptUrl: z.string().max(500).optional(),
});

export const RoomsSchema = z
  .object({
    available: count,
    sold: count,
    houseUse: count,
    revenueSen: nonNegSen,
    // Spec §4.1: "add an optional photo upload of that [iHotel daily] report."
    // No storage service is wired up, so this is a pasted link (WhatsApp,
    // Google Photos, etc.), not a real upload — not validated as a strict
    // URL, same as ExpenseLineSchema.receiptUrl above.
    reportPhotoUrl: z.string().max(500).optional(),
  })
  .refine((r) => r.sold + r.houseUse <= r.available, {
    message: "Rooms sold plus house use cannot exceed rooms available.",
    path: ["available"],
  });

export const CollectionsSchema = z.object({
  cashSen: nonNegSen,
  cardSen: nonNegSen,
  transferSen: nonNegSen,
  ewalletSen: nonNegSen,
  otaPrepaidSen: nonNegSen,
  chargeToAccountSen: nonNegSen,
  depositsSen: nonNegSen,
  refundsSen: nonNegSen,
  // Money collected today (already counted above, in cash/card/transfer/
  // ewallet) that pays off a receivable booked on an *earlier* day — a
  // monthly guest settling last month's chargeToAccount balance, an OTA
  // payout landing for a stay booked days ago. It corresponds to zero new
  // revenue today, so the revenue/collections identity in revenueGap()
  // needs it to avoid a false gap on days this happens.
  receivablesSettledSen: nonNegSen,
});

export const CashSchema = z.object({
  openingFloatSen: nonNegSen,
  bankedInSen: nonNegSen,
  countedSen: nonNegSen,
});

/** What the client sends on submit. The server adds date/status/actor/variance. */
export const NightReportInputSchema = z.object({
  rooms: RoomsSchema,
  revenueLines: z.array(RevenueLineSchema).max(50),
  collections: CollectionsSchema,
  expenses: z.array(ExpenseLineSchema).max(100),
  cash: CashSchema,
  remarks: z.string().max(2000).default(""),
  varianceReason: z.string().max(500).default(""),
  revenueGapReason: z.string().max(500).default(""),
  // Required by the server (not by this schema — it doesn't know the
  // current business date) whenever the submitted date isn't today's. One
  // line: was it a power cut, a sick shift, someone forgetting? The
  // enteredLate flag says it happened; this says why.
  enteredLateReason: z.string().max(300).default(""),
});

export type NightReportInput = z.infer<typeof NightReportInputSchema>;

// --- Cash reconciliation --------------------------------------------------

export interface ReconcileInput {
  collections: { cashSen: number; refundsSen: number };
  expenses: { amountSen: number; paidBy: (typeof PAID_BY)[number] }[];
  cash: { openingFloatSen: number; bankedInSen: number; countedSen: number };
}

export interface Reconciliation {
  cashInSen: number; // physical cash received at the desk
  cashExpensesSen: number; // petty cash paid in cash (card expenses excluded)
  refundsSen: number; // cash refunds paid out of the drawer
  bankedInSen: number;
  openingFloatSen: number;
  expectedCashSen: number;
  countedSen: number;
  varianceSen: number; // counted − expected; negative = short, positive = surplus
}

/**
 * Expected cash = opening float + cash collected − cash expenses − refunds
 * paid − cash banked in. Only cash expenses reduce the drawer; card ones do
 * not. Refunds paid at the desk are treated as leaving the drawer (a decided
 * assumption — see the Design/spec notes).
 */
export function reconcile(input: ReconcileInput): Reconciliation {
  const openingFloatSen = input.cash.openingFloatSen;
  const cashInSen = input.collections.cashSen;
  const cashExpensesSen = input.expenses
    .filter((e) => e.paidBy === "cash")
    .reduce((sum, e) => sum + e.amountSen, 0);
  const refundsSen = input.collections.refundsSen;
  const bankedInSen = input.cash.bankedInSen;

  const expectedCashSen =
    openingFloatSen + cashInSen - cashExpensesSen - refundsSen - bankedInSen;
  const countedSen = input.cash.countedSen;
  const varianceSen = countedSen - expectedCashSen;

  return {
    cashInSen,
    cashExpensesSen,
    refundsSen,
    bankedInSen,
    openingFloatSen,
    expectedCashSen,
    countedSen,
    varianceSen,
  };
}

/** A variance beyond tolerance demands a written reason before submit. */
export function requiresVarianceReason(
  varianceSen: number,
  thresholdSen: number,
): boolean {
  return Math.abs(varianceSen) > thresholdSen;
}

// --- Revenue reconciliation (spec §3 / CLAUDE.md rule 3) -------------------
//
// Revenue = Collections + Receivables added today − Receivables settled
// today. A warning, never a block (see night-report-form.tsx) — reception
// must always be able to submit. Deposits play no part in this identity:
// they're money in but not revenue, so they're excluded from both sides
// rather than netted against anything.

export interface RevenueGapInput {
  totalRevenueSen: number;
  collections: {
    cashSen: number;
    cardSen: number;
    transferSen: number;
    ewalletSen: number;
    otaPrepaidSen: number;
    chargeToAccountSen: number;
    refundsSen: number;
    receivablesSettledSen: number;
  };
}

export interface RevenueGap {
  actualCollectionsSen: number; // cash+card+transfer+ewallet, minus refunds paid out
  receivablesAddedSen: number; // OTA prepaid + charge to account
  receivablesSettledSen: number;
  expectedRevenueSen: number;
  totalRevenueSen: number;
  gapSen: number; // totalRevenue − expectedRevenue; 0 means the identity holds
}

export function revenueGap(input: RevenueGapInput): RevenueGap {
  const c = input.collections;
  const actualCollectionsSen =
    c.cashSen + c.cardSen + c.transferSen + c.ewalletSen - c.refundsSen;
  const receivablesAddedSen = c.otaPrepaidSen + c.chargeToAccountSen;
  const receivablesSettledSen = c.receivablesSettledSen;
  const expectedRevenueSen =
    actualCollectionsSen + receivablesAddedSen - receivablesSettledSen;
  const gapSen = input.totalRevenueSen - expectedRevenueSen;

  return {
    actualCollectionsSen,
    receivablesAddedSen,
    receivablesSettledSen,
    expectedRevenueSen,
    totalRevenueSen: input.totalRevenueSen,
    gapSen,
  };
}

// --- Room metrics (display only; not stored) ------------------------------

export function occupancyRatio(sold: number, available: number): number {
  return available > 0 ? sold / available : 0;
}

/** Average daily rate, in sen: room revenue ÷ rooms sold. */
export function adrSen(revenueSen: number, sold: number): number {
  return sold > 0 ? Math.round(revenueSen / sold) : 0;
}

/** Revenue per available room, in sen: room revenue ÷ rooms available. */
export function revparSen(revenueSen: number, available: number): number {
  return available > 0 ? Math.round(revenueSen / available) : 0;
}

/** Total revenue = room revenue + other revenue lines. */
export function totalRevenueSen(
  roomRevenueSen: number,
  revenueLines: { amountSen: number }[],
): number {
  return revenueLines.reduce((sum, l) => sum + l.amountSen, roomRevenueSen);
}

// --- Owner review (Step 4) --------------------------------------------------

/**
 * A small hotel's owner covers shifts, so submittedBy and approvedBy can
 * legitimately be the same person. Not blocked — CLAUDE.md rule 5 (approved
 * days are immutable) doesn't require a second person, only a record — but
 * flagged so it's visible in the review queue, not silently indistinguishable
 * from a normal two-person approval.
 */
export function isSelfApproved(
  submittedBy: string,
  approvedBy: string | null | undefined,
): boolean {
  return approvedBy != null && approvedBy === submittedBy;
}
