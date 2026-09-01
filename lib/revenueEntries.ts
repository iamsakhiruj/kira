/**
 * `revenueEntries` schema — pure, no database import. Standalone revenue:
 * money that arrives outside the front desk — an OTA payout, a corporate
 * payment landing directly in the account. Phase 1's night report remains
 * the source of truth for front-desk revenue; this collection is
 * everything else.
 */

import { z } from "zod";

const nonNegSen = z.number().int("Amounts are stored as whole sen.").min(0);
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

/** The full stored document shape. */
export const RevenueEntrySchema = z.object({
  date: businessDate,
  categoryId: z.string().min(1),
  amountSen: nonNegSen,
  paymentMethodId: z.string().min(1),
  receivedFrom: z.string().max(120).default(""),
  reference: z.string().max(120).default(""),
  note: z.string().max(500).default(""),
  /** See lib/expenses.ts's ExpenseSchema.linkedBusinessDayId — same rule. */
  linkedBusinessDayId: z.string().nullable(),
  /** User id, set server-side from the session. */
  recordedBy: z.string().min(1),
});

export type RevenueEntry = z.infer<typeof RevenueEntrySchema>;

/** What the client sends to create or edit one. */
export const RevenueEntryInputSchema = z.object({
  date: businessDate,
  categoryId: z.string().min(1, "Choose a category."),
  amountSen: z.number().int().min(1, "Enter an amount greater than zero."),
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  receivedFrom: z.string().max(120).default(""),
  reference: z.string().max(120).default(""),
  note: z.string().max(500).default(""),
});
