import { describe, it, expect } from "vitest";
import {
  reconcile,
  requiresVarianceReason,
  occupancyRatio,
  adrSen,
  revparSen,
  totalRevenueSen,
  type ReconcileInput,
} from "./nightReport";

function base(): ReconcileInput {
  return {
    collections: { cashSen: 62000, refundsSen: 0 },
    expenses: [
      { amountSen: 8500, paidBy: "cash" },
      { amountSen: 3000, paidBy: "card" }, // card must NOT reduce the drawer
    ],
    cash: { openingFloatSen: 10000, bankedInSen: 50000, countedSen: 13500 },
  };
}

describe("reconcile", () => {
  it("computes expected cash from the drawer formula", () => {
    // 10000 + 62000 − 8500 (cash only) − 0 − 50000 = 13500
    const r = reconcile(base());
    expect(r.cashExpensesSen).toBe(8500);
    expect(r.expectedCashSen).toBe(13500);
    expect(r.varianceSen).toBe(0);
  });

  it("excludes card expenses from cash paid out", () => {
    const r = reconcile(base());
    // only the 8500 cash expense counts, not the 3000 card one
    expect(r.cashExpensesSen).toBe(8500);
  });

  it("subtracts cash refunds from expected cash", () => {
    const input = base();
    input.collections.refundsSen = 2000;
    const r = reconcile(input);
    expect(r.refundsSen).toBe(2000);
    expect(r.expectedCashSen).toBe(11500);
    expect(r.varianceSen).toBe(2000); // counted 13500 − expected 11500
  });

  it("reports a shortfall as a negative variance", () => {
    const input = base();
    input.cash.countedSen = 13000;
    expect(reconcile(input).varianceSen).toBe(-500);
  });

  it("reports a surplus as a positive variance", () => {
    const input = base();
    input.cash.countedSen = 14000;
    expect(reconcile(input).varianceSen).toBe(500);
  });

  it("handles an empty day", () => {
    const r = reconcile({
      collections: { cashSen: 0, refundsSen: 0 },
      expenses: [],
      cash: { openingFloatSen: 0, bankedInSen: 0, countedSen: 0 },
    });
    expect(r.expectedCashSen).toBe(0);
    expect(r.varianceSen).toBe(0);
  });
});

describe("requiresVarianceReason", () => {
  it("is true only beyond the threshold", () => {
    expect(requiresVarianceReason(2000, 2000)).toBe(false); // exactly at
    expect(requiresVarianceReason(2001, 2000)).toBe(true);
    expect(requiresVarianceReason(-2001, 2000)).toBe(true); // shortfall too
    expect(requiresVarianceReason(0, 2000)).toBe(false);
  });
});

describe("room metrics", () => {
  it("occupancy is sold / available, guarding divide-by-zero", () => {
    expect(occupancyRatio(12, 20)).toBeCloseTo(0.6);
    expect(occupancyRatio(5, 0)).toBe(0);
  });

  it("ADR is revenue / sold, rounded to whole sen", () => {
    expect(adrSen(185000, 12)).toBe(15417); // 185000/12 = 15416.6…
    expect(adrSen(185000, 0)).toBe(0);
  });

  it("RevPAR is revenue / available", () => {
    expect(revparSen(185000, 20)).toBe(9250);
    expect(revparSen(185000, 0)).toBe(0);
  });

  it("total revenue adds room revenue and other lines", () => {
    expect(
      totalRevenueSen(185000, [{ amountSen: 4000 }, { amountSen: 1500 }]),
    ).toBe(190500);
  });
});
