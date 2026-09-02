/**
 * Salary calculation — pure, no database. This is the arithmetic the whole
 * module exists to get right, so it lives here on its own and is unit-tested
 * (CLAUDE.md conventions: money maths carries tests).
 *
 * SCOPE: this system does NOT calculate statutory deductions. PCB, EPF, SOCSO
 * and EIS are the accountant's job. There are no rate tables or Third Schedule
 * logic anywhere. Statutory deductions enter as a single owner-typed figure and
 * are subtracted as-is. We record what was paid; we don't compute the tax.
 *
 * The one calculation that must be right, because getting it wrong underpays a
 * real person and breaches the Employment Act:
 *
 *   Monthly-rated staff get their FULL monthly wage regardless of paid leave.
 *   Annual leave, sick leave, public holidays and rest days do NOT reduce pay.
 *   ONLY days marked `unpaid_absence` reduce it, at the ordinary rate of pay:
 *
 *       unpaidAbsenceDeductionSen
 *         = round( basicAmountSen × unpaidAbsenceDays / 26 )
 *
 *   The divisor is the FIXED 26 that s.60I of the Employment Act 1955 defines
 *   as the ordinary rate of pay for a monthly-rated employee (monthly wages ÷
 *   26) — a fixed number, not the month's actual working days. A working-days
 *   divisor produces a larger deduction in most months (fewer than 26 working
 *   days), which underpays: deducting MORE than the Act permits is the error
 *   that matters; deducting less is not. See ORDINARY_RATE_DIVISOR below.
 *
 *   The product is rounded ONCE, not per day, so rounding never drifts against
 *   the employee across multiple unpaid days.
 *
 *   Daily-rated staff are simpler: they are paid daily rate × days present. An
 *   absent day is just not a present day, so no separate unpaid deduction line
 *   applies to them.
 */

import { DAY_STATUSES } from "./attendance";

export const SALARY_STATUSES = ["draft", "paid"] as const;
export type SalaryStatus = (typeof SALARY_STATUSES)[number];

/**
 * Ordinary rate of pay divisor for monthly-rated staff. Employment Act 1955
 * s.60I defines the ordinary rate of pay of a monthly-rated employee as
 * monthly wages ÷ 26 — a FIXED divisor, not the number of working days in the
 * particular month. Deducting for unpaid absence at anything smaller than 26
 * (e.g. actual working days, which is usually < 26) would deduct more than the
 * Act permits and underpay the employee. 26 stays 26 regardless of how many
 * working days a month happens to have.
 */
export const ORDINARY_RATE_DIVISOR = 26;

export type PayType = "monthly" | "daily";

/** Tally of an attendance month by status. */
export interface AttendanceCounts {
  present: number;
  annual_leave: number;
  sick_leave: number;
  public_holiday: number;
  unpaid_absence: number;
  rest_day: number;
  /** Days actually recorded in the grid (sum of the above). */
  recorded: number;
}

/** Count each status in a month's day array. Ignores unknown statuses. */
export function countAttendanceDays(
  days: { status: string }[],
): AttendanceCounts {
  const counts: AttendanceCounts = {
    present: 0,
    annual_leave: 0,
    sick_leave: 0,
    public_holiday: 0,
    unpaid_absence: 0,
    rest_day: 0,
    recorded: 0,
  };
  for (const d of days) {
    if ((DAY_STATUSES as readonly string[]).includes(d.status)) {
      counts[d.status as keyof AttendanceCounts]++;
      counts.recorded++;
    }
  }
  return counts;
}

/** Calendar days in a "YYYY-MM" month (28–31). Computed in UTC so no timezone
 * can shift the day count. */
export function daysInCalendarMonth(month: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`Invalid month "${month}", expected YYYY-MM.`);
  const year = Number(m[1]);
  const monthIndex = Number(m[2]); // 1–12
  if (monthIndex < 1 || monthIndex > 12) {
    throw new Error(`Invalid month "${month}".`);
  }
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

/**
 * Actual working days in the month = calendar days − rest days − public
 * holidays. This is the divisor for the monthly-rated unpaid-absence
 * deduction.
 */
export function workingDaysInMonth(
  month: string,
  counts: AttendanceCounts,
): number {
  return daysInCalendarMonth(month) - counts.rest_day - counts.public_holiday;
}

export interface SalaryInput {
  payType: PayType;
  /** Monthly basic wage (monthly-rated) OR daily rate (daily-rated), in sen. */
  basicAmountSen: number;
  fixedAllowancesSen: number;
  presentDays: number;
  unpaidAbsenceDays: number;
  advanceRepaymentSen: number;
  otherDeductionSen: number;
  statutoryDeductionSen: number;
}

export interface SalaryComputation {
  /** Earned basic before allowances: full monthly amount, or rate × present. */
  basicEarnedSen: number;
  allowancesSen: number;
  grossSen: number;
  unpaidAbsenceDeductionSen: number;
  advanceRepaymentSen: number;
  otherDeductionSen: number;
  statutoryDeductionSen: number;
  totalDeductionsSen: number;
  netSen: number;
}

function assertNonNegInt(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative whole number of sen.`);
  }
}

/**
 * Compute one employee's salary for one month. Pure and deterministic. Every
 * figure returned here is snapshotted onto the salaryPayments document so a
 * paid run never recomputes from live data later.
 */
export function computeSalary(input: SalaryInput): SalaryComputation {
  assertNonNegInt(input.basicAmountSen, "Basic amount");
  assertNonNegInt(input.fixedAllowancesSen, "Fixed allowances");
  assertNonNegInt(input.advanceRepaymentSen, "Advance repayment");
  assertNonNegInt(input.otherDeductionSen, "Other deduction");
  assertNonNegInt(input.statutoryDeductionSen, "Statutory deduction");
  if (!Number.isInteger(input.presentDays) || input.presentDays < 0) {
    throw new Error("Present days must be a non-negative whole number.");
  }
  if (!Number.isInteger(input.unpaidAbsenceDays) || input.unpaidAbsenceDays < 0) {
    throw new Error("Unpaid absence days must be a non-negative whole number.");
  }

  let basicEarnedSen: number;
  let unpaidAbsenceDeductionSen: number;

  if (input.payType === "monthly") {
    // Full monthly wage regardless of paid leave. Only unpaid absence reduces
    // it, at the ordinary rate of pay (basic ÷ 26 per s.60I) — a single
    // rounding on the product so it can't drift against the employee.
    basicEarnedSen = input.basicAmountSen;
    unpaidAbsenceDeductionSen =
      input.unpaidAbsenceDays === 0
        ? 0
        : Math.round(
            (input.basicAmountSen * input.unpaidAbsenceDays) /
              ORDINARY_RATE_DIVISOR,
          );
  } else {
    // Daily-rated: paid for days present; absence is simply unpaid, no line.
    basicEarnedSen = input.basicAmountSen * input.presentDays;
    unpaidAbsenceDeductionSen = 0;
  }

  const allowancesSen = input.fixedAllowancesSen;
  const grossSen = basicEarnedSen + allowancesSen;
  const totalDeductionsSen =
    unpaidAbsenceDeductionSen +
    input.advanceRepaymentSen +
    input.otherDeductionSen +
    input.statutoryDeductionSen;
  const netSen = grossSen - totalDeductionsSen;

  return {
    basicEarnedSen,
    allowancesSen,
    grossSen,
    unpaidAbsenceDeductionSen,
    advanceRepaymentSen: input.advanceRepaymentSen,
    otherDeductionSen: input.otherDeductionSen,
    statutoryDeductionSen: input.statutoryDeductionSen,
    totalDeductionsSen,
    netSen,
  };
}
