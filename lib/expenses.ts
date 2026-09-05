/**
 * `expenses` schema — pure, no database import (see `lib/paymentMethods.ts`
 * for the pattern). Standalone expenses: everything reception never
 * touches (spec §5.2) — salaries, rent, utilities, supplier invoices paid
 * outside the front desk. Phase 1's night report remains the source of
 * truth for front-desk petty cash; this collection is everything else.
 *
 * `categoryId` and `paymentMethodId` are references, not copied names —
 * §3: "one list referenced by revenue, expenses, partner transactions and
 * salary payments."
 */

import { z } from "zod";

export const CAPITAL_OR_OPERATING = ["capital", "operating"] as const;

const nonNegSen = z.number().int("Amounts are stored as whole sen.").min(0);
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

/** "EV-2026-0001" — same shape as bookings' formatBookingRef. */
export function formatExpenseVoucherRef(year: number, seq: number): string {
  return `EV-${year}-${String(seq).padStart(4, "0")}`;
}

/** The full stored document shape. */
export const ExpenseSchema = z.object({
  date: businessDate,
  categoryId: z.string().min(1),
  amountSen: nonNegSen,
  paymentMethodId: z.string().min(1),
  paidTo: z.string().max(120).default(""),
  /** User id, set server-side from the session — never client input. */
  paidBy: z.string().min(1),
  capitalOrOperating: z.enum(CAPITAL_OR_OPERATING),
  reference: z.string().max(120).default(""),
  note: z.string().max(500).default(""),
  receiptUrl: z.string().max(500).optional(),
  /**
   * null = standalone (the normal case for anything entered through this
   * screen). Non-null would mean "already represented in a night report,
   * don't double count me" — nothing in this step's own form sets it to
   * non-null; the field exists so 2.8's reporting can rely on it.
   */
  linkedBusinessDayId: z.string().nullable(),
  /**
   * Sequential and gapless — assigned once, the first time an expense
   * voucher PDF is generated for this expense (lib/expensesStore.ts's
   * getOrAssignVoucherNumber, via lib/countersStore.ts's nextSequence in a
   * transaction), then reused on every reprint. Unset until then, same
   * lazy-allocation shape as bookings' reference number, except assigned on
   * first print rather than on create — there is no "create a voucher"
   * step separate from generating its PDF.
   */
  voucherNumber: z.string().max(40).optional(),
  // Soft delete — never a hard removal (breaks the audit trail and silently
  // changes past reports). Server-set; excluded from balances/reports and
  // hidden from the list by default.
  deleted: z.boolean().optional(),
  deletedReason: z.string().optional(),
  deletedBy: z.string().optional(),
  deletedAt: z.date().optional(),
});

export type Expense = z.infer<typeof ExpenseSchema>;

/** What the client sends to create or edit one. */
export const ExpenseInputSchema = z.object({
  date: businessDate,
  categoryId: z.string().min(1, "Choose a category."),
  amountSen: z.number().int().min(1, "Enter an amount greater than zero."),
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  paidTo: z.string().max(120).default(""),
  capitalOrOperating: z.enum(CAPITAL_OR_OPERATING),
  reference: z.string().max(120).default(""),
  note: z.string().max(500).default(""),
  receiptUrl: z.string().max(500).optional(),
});
