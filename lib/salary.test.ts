import { describe, it, expect } from "vitest";
import {
  computeSalary,
  countAttendanceDays,
  daysInCalendarMonth,
  workingDaysInMonth,
  ORDINARY_RATE_DIVISOR,
  type SalaryInput,
} from "./salary";

const base: SalaryInput = {
  payType: "monthly",
  basicAmountSen: 260000, // RM 2,600.00
  fixedAllowancesSen: 0,
  overtimeSen: 0,
  presentDays: 0,
  unpaidAbsenceDays: 0,
  advanceRepaymentSen: 0,
  otherDeductionSen: 0,
  statutoryDeductionSen: 0,
};

it("uses the fixed s.60I divisor of 26", () => {
  expect(ORDINARY_RATE_DIVISOR).toBe(26);
});

describe("countAttendanceDays", () => {
  it("tallies each status and ignores unknown ones", () => {
    const c = countAttendanceDays([
      { status: "present" },
      { status: "present" },
      { status: "annual_leave" },
      { status: "unpaid_absence" },
      { status: "rest_day" },
      { status: "public_holiday" },
      { status: "sick_leave" },
      { status: "banana" }, // ignored
    ]);
    expect(c.present).toBe(2);
    expect(c.annual_leave).toBe(1);
    expect(c.unpaid_absence).toBe(1);
    expect(c.rest_day).toBe(1);
    expect(c.public_holiday).toBe(1);
    expect(c.sick_leave).toBe(1);
    expect(c.recorded).toBe(7);
  });
});

describe("daysInCalendarMonth", () => {
  it("handles 30-, 31- and 28/29-day months", () => {
    expect(daysInCalendarMonth("2026-09")).toBe(30);
    expect(daysInCalendarMonth("2026-01")).toBe(31);
    expect(daysInCalendarMonth("2026-02")).toBe(28);
    expect(daysInCalendarMonth("2028-02")).toBe(29); // leap year
  });
  it("rejects a malformed month", () => {
    expect(() => daysInCalendarMonth("2026-13")).toThrow();
    expect(() => daysInCalendarMonth("nope")).toThrow();
  });
});

describe("workingDaysInMonth", () => {
  it("is calendar days minus rest days and public holidays", () => {
    // Sept 2026 = 30 days; 4 rest days + 2 public holidays = 24 working days.
    const counts = countAttendanceDays([
      ...Array(2).fill({ status: "public_holiday" }),
      ...Array(4).fill({ status: "rest_day" }),
      ...Array(24).fill({ status: "present" }),
    ]);
    expect(workingDaysInMonth("2026-09", counts)).toBe(24);
  });
});

describe("computeSalary — monthly-rated Employment Act rules", () => {
  it("pays the FULL wage when only PAID leave is taken (the legal trap)", () => {
    // A month full of annual/sick/public-holiday/rest days must NOT reduce pay.
    const r = computeSalary({
      ...base,
      unpaidAbsenceDays: 0,
      presentDays: 10,
    });
    expect(r.unpaidAbsenceDeductionSen).toBe(0);
    expect(r.grossSen).toBe(260000);
    expect(r.netSen).toBe(260000);
  });

  it("deducts ordinary rate of pay per unpaid day at basic ÷ 26, rounded once", () => {
    // RM 2,600, 2 unpaid days -> round(260000*2/26) = 20000 = RM 200.00.
    const r = computeSalary({ ...base, unpaidAbsenceDays: 2 });
    expect(r.unpaidAbsenceDeductionSen).toBe(20000); // RM 200.00
    expect(r.netSen).toBe(260000 - 20000);
  });

  it("uses the fixed /26 divisor even in a month with only 25 working days", () => {
    // A 25-working-day month must NOT deduct at /25 (which would over-deduct
    // and underpay). One unpaid day is basic/26, never basic/25.
    const r = computeSalary({ ...base, basicAmountSen: 260000, unpaidAbsenceDays: 1 });
    expect(r.unpaidAbsenceDeductionSen).toBe(Math.round(260000 / 26)); // 10000
    expect(r.unpaidAbsenceDeductionSen).toBe(10000);
    // The larger /25 deduction is what we must avoid.
    expect(r.unpaidAbsenceDeductionSen).not.toBe(Math.round(260000 / 25)); // 10400
    expect(r.unpaidAbsenceDeductionSen).toBeLessThan(Math.round(260000 / 25));
  });

  it("rounds the product once, not per day (no drift against the employee)", () => {
    // basic 3000, 3 unpaid: product round(300000*3/26)=34615;
    // per-day round(300000/26)=11538 ×3 = 34614. We use the product.
    const perDay = Math.round(300000 / 26) * 3;
    const r = computeSalary({ ...base, basicAmountSen: 300000, unpaidAbsenceDays: 3 });
    expect(r.unpaidAbsenceDeductionSen).toBe(34615);
    expect(r.unpaidAbsenceDeductionSen).not.toBe(perDay); // 34614
  });

  it("26 unpaid days withholds the whole basic (26/26)", () => {
    const r = computeSalary({ ...base, unpaidAbsenceDays: 26 });
    expect(r.unpaidAbsenceDeductionSen).toBe(260000);
    expect(r.grossSen - r.unpaidAbsenceDeductionSen).toBe(0);
  });

  it("adds fixed allowances to gross and does not deduct them for unpaid absence", () => {
    const r = computeSalary({
      ...base,
      fixedAllowancesSen: 30000, // RM 300 allowance
      unpaidAbsenceDays: 2,
    });
    expect(r.allowancesSen).toBe(30000);
    expect(r.grossSen).toBe(260000 + 30000);
    // Deduction is based on basic only, not gross.
    expect(r.unpaidAbsenceDeductionSen).toBe(20000);
  });

  it("adds a manual overtime total to gross without affecting the unpaid-absence deduction", () => {
    // Overtime is an owner-typed figure (this system has no hours × rate
    // calculation) — it adds to gross like an allowance, but stays a
    // separate line, and never enters the ordinary-rate-of-pay divisor.
    const r = computeSalary({
      ...base,
      overtimeSen: 15000, // RM 150
      unpaidAbsenceDays: 2,
    });
    expect(r.overtimeSen).toBe(15000);
    expect(r.grossSen).toBe(260000 + 15000);
    expect(r.unpaidAbsenceDeductionSen).toBe(20000);
  });
});

describe("computeSalary — daily-rated", () => {
  it("pays daily rate × days present, with no unpaid-absence line", () => {
    const r = computeSalary({
      ...base,
      payType: "daily",
      basicAmountSen: 12000, // RM 120/day
      presentDays: 18,
      unpaidAbsenceDays: 5, // irrelevant to daily pay
    });
    expect(r.basicEarnedSen).toBe(12000 * 18);
    expect(r.unpaidAbsenceDeductionSen).toBe(0);
    expect(r.grossSen).toBe(216000);
    expect(r.netSen).toBe(216000);
  });
});

describe("computeSalary — deductions and net", () => {
  it("subtracts advance, other and statutory deductions from gross", () => {
    const r = computeSalary({
      ...base,
      advanceRepaymentSen: 20000, // RM 200
      otherDeductionSen: 5000, // RM 50
      statutoryDeductionSen: 41300, // RM 413 typed from accountant, NOT computed
    });
    expect(r.totalDeductionsSen).toBe(20000 + 5000 + 41300);
    expect(r.netSen).toBe(260000 - (20000 + 5000 + 41300));
  });

  it("can produce a negative net (over-deducted) rather than clamping silently", () => {
    const r = computeSalary({ ...base, advanceRepaymentSen: 300000 });
    expect(r.netSen).toBe(260000 - 300000);
    expect(r.netSen).toBeLessThan(0);
  });

  it("rejects negative or non-integer sen inputs", () => {
    expect(() => computeSalary({ ...base, basicAmountSen: -1 })).toThrow();
    expect(() => computeSalary({ ...base, statutoryDeductionSen: 1.5 })).toThrow();
  });
});
