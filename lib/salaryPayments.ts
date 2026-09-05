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

/**
 * The editable configuration of a payslip PDF (remarks + which optional
 * fields to show) — same pattern as the booking letter's LetterConfig.
 * Stored on the salary payment after each generate so a reprint weeks later
 * matches what was issued, not a silently different document. Cosmetic only
 * — it never touches a pay figure, so it stays editable even on a paid line.
 */
export const PAYSLIP_OPTIONAL_FIELDS = [
  "employeeNumber",
  "bankAccountLast4",
  "overtime",
] as const;
export type PayslipOptionalField = (typeof PAYSLIP_OPTIONAL_FIELDS)[number];

const PayslipShowFieldsSchema = z.object({
  employeeNumber: z.boolean(),
  bankAccountLast4: z.boolean(),
  overtime: z.boolean(),
});

export const PayslipConfigSchema = z.object({
  remarks: z.string().trim().max(1000).default(""),
  show: PayslipShowFieldsSchema,
});
export type PayslipConfig = z.infer<typeof PayslipConfigSchema>;

/** Every optional field shown by default — same "show everything unless
 * told otherwise" default as the reservation letter. */
export function defaultPayslipConfig(): PayslipConfig {
  return {
    remarks: "",
    show: { employeeNumber: true, bankAccountLast4: true, overtime: true },
  };
}

export const SalaryPaymentSchema = z.object({
  employeeId: z.string().min(1),
  // Snapshot of identity so the payslip and history stand alone even if the
  // employee record later changes.
  employeeName: z.string().min(1),
  /** Snapshotted at generation time (see lib/employees.ts) — frozen like
   * employeeName/position so a paid run's payslip never drifts if the
   * employee record is edited afterwards. */
  employeeNumber: z.string().max(40).default(""),
  position: z.string().default(""),
  month: monthStr,
  payType: z.enum(["monthly", "daily"]),

  // --- snapshot of inputs ---
  basicAmountSen: nonNegSen,
  fixedAllowancesSen: nonNegSen,
  /** Manual, owner-typed total — see lib/salary.ts's SalaryInput.overtimeSen. */
  overtimeSen: nonNegSen.default(0),
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
  /** Bank name + last 4 digits of the account, snapshotted from the
   * employee record at generation time (same freeze reasoning as
   * employeeNumber above) — the payslip shows only the last 4 digits, never
   * the full account number. */
  bankName: z.string().max(120).default(""),
  bankAccountLast4: z.string().max(4).default(""),

  // --- payslip PDF presentation (cosmetic; see PayslipConfigSchema above) ---
  payslipConfig: PayslipConfigSchema.nullable().default(null),

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
    overtimeSen: nonNegSen,
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
