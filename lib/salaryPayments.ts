/**
 * `salaryPayments` schema — pure, no database import (DB access lives in
 * `lib/salaryStore.ts`). One document per employee per month for the base run;
 * corrections are separate documents that reference the original via
 * `adjustmentOf` — history is never mutated (same rule as approved days and
 * frozen profit shares).
 *
 * Every input and every computed figure is snapshotted onto the document. A
 * paid run must never recompute from live attendance or a since-edited
 * employee record — the numbers on the payslip are the numbers that were paid.
 */

import { z } from "zod";
import { SALARY_STATUSES } from "./salary";

const nonNegSen = z.number().int("Amounts are stored as whole sen.").min(0);
const monthStr = z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM.");
const nullableDateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
  .nullable();

export const SalaryPaymentSchema = z.object({
  employeeId: z.string().min(1),
  // Snapshot of identity so the payslip and history stand alone even if the
  // employee record later changes.
  employeeName: z.string().min(1),
  position: z.string().default(""),
  month: monthStr,
  payType: z.enum(["monthly", "daily"]),

  // --- snapshot of inputs ---
  basicAmountSen: nonNegSen,
  fixedAllowancesSen: nonNegSen,
  presentDays: z.number().int().min(0),
  unpaidAbsenceDays: z.number().int().min(0),
  workingDaysInMonth: z.number().int().min(0),

  // --- computed snapshot ---
  basicEarnedSen: nonNegSen,
  allowancesSen: nonNegSen,
  grossSen: nonNegSen,
  unpaidAbsenceDeductionSen: nonNegSen,
  advanceRepaymentSen: nonNegSen,
  otherDeductionSen: nonNegSen,
  otherDeductionNote: z.string().max(200).default(""),
  statutoryDeductionSen: nonNegSen,
  totalDeductionsSen: nonNegSen,
  netSen: z.number().int(), // may be negative if over-deducted

  // --- payment ---
  paymentMethodId: z.string().nullable().default(null),
  paidDate: nullableDateStr.default(null),
  status: z.enum(SALARY_STATUSES),

  // --- director remuneration flag (a partner-linked employee) ---
  directorRemuneration: z.boolean().default(false),
  partnerId: z.string().nullable().default(null),

  // --- corrections ---
  adjustmentOf: z.string().nullable().default(null),

  // --- audit trail on the document itself ---
  createdBy: z.string().min(1),
  createdAt: z.date(),
  paidBy: z.string().nullable().default(null),
  paidAt: z.date().nullable().default(null),
});

export type SalaryPayment = z.infer<typeof SalaryPaymentSchema>;

/** What the owner may change on a draft line (deductions and payment method).
 * Gross and the unpaid-absence figure come from the frozen snapshot / a
 * refresh, never hand-edited here. */
export const SalaryLineEditSchema = z
  .object({
    advanceRepaymentSen: nonNegSen,
    otherDeductionSen: nonNegSen,
    otherDeductionNote: z.string().max(200).default(""),
    statutoryDeductionSen: nonNegSen,
    paymentMethodId: z.string().nullable().default(null),
  })
  .refine((v) => v.otherDeductionSen === 0 || v.otherDeductionNote.trim().length > 0, {
    message: "Add a note for the other deduction.",
    path: ["otherDeductionNote"],
  });

export const MarkPaidSchema = z.object({
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the paid date."),
});
