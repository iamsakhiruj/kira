import { describe, it, expect } from "vitest";
import {
  reconcile,
  requiresVarianceReason,
  occupancyRatio,
  adrSen,
  revparSen,
  totalRevenueSen,
  revenueGap,
  type ReconcileInput,
  type RevenueGapInput,
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

describe("revenueGap", () => {
  function base(): RevenueGapInput {
    return {
      totalRevenueSen: 185000,
      collections: {
        cashSen: 62000,
        cardSen: 60000,
        transferSen: 43000,
        ewalletSen: 20000,
        otaPrepaidSen: 0,
        chargeToAccountSen: 0,
        refundsSen: 0,
        receivablesSettledSen: 0,
      },
    };
  }

  it("is zero when revenue exactly equals collections", () => {
    // 62000+60000+43000+20000 = 185000, matches totalRevenueSen exactly
    expect(revenueGap(base()).gapSen).toBe(0);
  });

  it("treats OTA prepaid and charge-to-account as receivables added, closing the gap", () => {
    const input = base();
    input.collections.cardSen = 60000 - 15000; // RM150 less arrived at the desk...
    input.collections.otaPrepaidSen = 15000; // ...because it's an OTA receivable instead
    expect(revenueGap(input).gapSen).toBe(0);
  });

  it("subtracts refunds paid out from collections", () => {
    const input = base();
    input.collections.refundsSen = 5000;
    // expected revenue drops by 5000, so today's revenue now looks 5000 too high
    expect(revenueGap(input).gapSen).toBe(5000);
  });

  it("nets out a settled receivable so cash for an old bill isn't mistaken for today's revenue", () => {
    const input = base();
    input.collections.cashSen += 4000; // a monthly guest pays off an old balance in cash
    input.collections.receivablesSettledSen = 4000; // ...which this field says isn't new revenue
    expect(revenueGap(input).gapSen).toBe(0);
  });

  it("flags a real gap when revenue and collections genuinely disagree", () => {
    const input = base();
    input.totalRevenueSen = 200000; // RM500 of revenue with nothing collected for it
    expect(revenueGap(input).gapSen).toBe(15000);
  });

  it("excludes deposits from the identity entirely — they never distort the gap", () => {
    // depositsSen isn't even a field on RevenueGapInput.collections: a day
    // that takes a large guest deposit must not move gapSen at all.
    expect(revenueGap(base()).gapSen).toBe(0);
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
