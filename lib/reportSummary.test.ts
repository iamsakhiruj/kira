import { describe, it, expect } from "vitest";
import {
  revenueBySource,
  expensesByCategory,
  netProfitSen,
  cashMovement,
  collectionsByChannel,
  occupancy,
  lateSubmissionCount,
  type NightDayDoc,
  type StandaloneEntry,
  type PartnerTxn,
} from "./reportSummary";
import { combinedTotalSen } from "./reporting";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDay(overrides: Partial<NightDayDoc> = {}): NightDayDoc {
  return {
    rooms: { available: 10, sold: 5, houseUse: 0, revenueSen: 50000 },
    revenueLines: [],
    expenses: [],
    collections: {
      cashSen: 0,
      cardSen: 0,
      transferSen: 0,
      ewalletSen: 0,
      otaPrepaidSen: 0,
      chargeToAccountSen: 0,
      depositsSen: 0,
      refundsSen: 0,
      receivablesSettledSen: 0,
    },
    cash: { openingFloatSen: 0, bankedInSen: 0, countedSen: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// revenueBySource
// ---------------------------------------------------------------------------

describe("revenueBySource", () => {
  it("grand total equals combinedTotalSen invariant", () => {
    const days = [
      makeDay({ rooms: { available: 10, sold: 5, houseUse: 0, revenueSen: 50000 }, revenueLines: [{ category: "Laundry", amountSen: 3000 }] }),
      makeDay({ rooms: { available: 10, sold: 3, houseUse: 0, revenueSen: 30000 }, revenueLines: [] }),
    ];
    const standalone: StandaloneEntry[] = [
      { amountSen: 8000, linkedBusinessDayId: null, categoryId: "cat1", paymentMethodId: "pm1" },
    ];
    const catMap = new Map([["cat1", "OTA commission"]]);

    const { totalSen } = revenueBySource(days, standalone, catMap);

    // Night totals per day: 53000, 30000
    const expected = combinedTotalSen([53000, 30000], standalone);
    expect(totalSen).toBe(expected);
    expect(totalSen).toBe(91000);
  });

  it("excludes linked standalone entries (double-counting rule)", () => {
    const days = [makeDay({ rooms: { available: 10, sold: 5, houseUse: 0, revenueSen: 50000 }, revenueLines: [] })];
    const standalone: StandaloneEntry[] = [
      { amountSen: 10000, linkedBusinessDayId: null, categoryId: "cat1", paymentMethodId: "pm1" },
      { amountSen: 99999, linkedBusinessDayId: "day-1", categoryId: "cat1", paymentMethodId: "pm1" }, // linked — must not count
    ];
    const catMap = new Map([["cat1", "OTA payout"]]);

    const { totalSen, sources } = revenueBySource(days, standalone, catMap);
    expect(totalSen).toBe(60000); // 50000 + 10000, NOT + 99999
    // linked entry's category should not appear in breakdown either
    const otaSource = sources.find((s) => s.name === "OTA payout");
    expect(otaSource?.amountSen).toBe(10000);
  });

  it("Rooms source appears when rooms.revenueSen > 0", () => {
    const days = [makeDay()];
    const { sources } = revenueBySource(days, [], new Map());
    const rooms = sources.find((s) => s.name === "Rooms");
    expect(rooms).toBeDefined();
    expect(rooms!.amountSen).toBe(50000);
  });

  it("sources are sorted descending by amountSen", () => {
    const days = [
      makeDay({
        rooms: { available: 10, sold: 2, houseUse: 0, revenueSen: 20000 },
        revenueLines: [
          { category: "Laundry", amountSen: 5000 },
          { category: "Parking", amountSen: 100 },
        ],
      }),
    ];
    const { sources } = revenueBySource(days, [], new Map());
    for (let i = 1; i < sources.length; i++) {
      expect(sources[i - 1].amountSen).toBeGreaterThanOrEqual(sources[i].amountSen);
    }
  });

  it("empty input yields zero total and no sources", () => {
    const { totalSen, sources } = revenueBySource([], [], new Map());
    expect(totalSen).toBe(0);
    expect(sources).toHaveLength(0);
  });

  it("groups same-category revenue lines across multiple days", () => {
    const days = [
      makeDay({ rooms: { available: 10, sold: 0, houseUse: 0, revenueSen: 0 }, revenueLines: [{ category: "Laundry", amountSen: 3000 }] }),
      makeDay({ rooms: { available: 10, sold: 0, houseUse: 0, revenueSen: 0 }, revenueLines: [{ category: "Laundry", amountSen: 2000 }] }),
    ];
    const { sources } = revenueBySource(days, [], new Map());
    const laundry = sources.find((s) => s.name === "Laundry");
    expect(laundry?.amountSen).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// expensesByCategory
// ---------------------------------------------------------------------------

describe("expensesByCategory", () => {
  it("grand total equals combinedTotalSen invariant", () => {
    const days = [
      makeDay({ expenses: [{ category: "Cleaning materials", amountSen: 5000, paidBy: "cash" }, { category: "Transport", amountSen: 2000, paidBy: "card" }] }),
    ];
    const standalone: StandaloneEntry[] = [
      { amountSen: 3000, linkedBusinessDayId: null, categoryId: "catExp1", paymentMethodId: "pm1" },
    ];
    const catMap = new Map([["catExp1", "Rent"]]);

    const { totalSen } = expensesByCategory(days, standalone, catMap);
    const expected = combinedTotalSen([7000], standalone);
    expect(totalSen).toBe(expected);
    expect(totalSen).toBe(10000);
  });

  it("excludes linked standalone entries (double-counting rule)", () => {
    const days = [makeDay({ expenses: [{ category: "Cleaning materials", amountSen: 5000, paidBy: "cash" }] })];
    const standalone: StandaloneEntry[] = [
      { amountSen: 2000, linkedBusinessDayId: null, categoryId: "catExp1", paymentMethodId: "pm1" },
      { amountSen: 99999, linkedBusinessDayId: "some-day", categoryId: "catExp1", paymentMethodId: "pm1" },
    ];
    const catMap = new Map([["catExp1", "Rent"]]);

    const { totalSen } = expensesByCategory(days, standalone, catMap);
    expect(totalSen).toBe(7000); // 5000 + 2000, NOT 99999
  });

  it("empty input yields zero total and no categories", () => {
    const { totalSen, categories } = expensesByCategory([], [], new Map());
    expect(totalSen).toBe(0);
    expect(categories).toHaveLength(0);
  });

  it("groups same category across days", () => {
    const days = [
      makeDay({ expenses: [{ category: "Transport", amountSen: 1000, paidBy: "cash" }] }),
      makeDay({ expenses: [{ category: "Transport", amountSen: 2000, paidBy: "card" }] }),
    ];
    const { categories } = expensesByCategory(days, [], new Map());
    const transport = categories.find((c) => c.name === "Transport");
    expect(transport?.amountSen).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// netProfitSen
// ---------------------------------------------------------------------------

describe("netProfitSen", () => {
  it("positive profit", () => {
    expect(netProfitSen(100000, 60000)).toBe(40000);
  });
  it("negative profit (loss month)", () => {
    expect(netProfitSen(50000, 80000)).toBe(-30000);
  });
  it("zero profit", () => {
    expect(netProfitSen(50000, 50000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cashMovement
// ---------------------------------------------------------------------------

describe("cashMovement", () => {
  it("computes all fields correctly", () => {
    const days = [
      makeDay({
        collections: {
          cashSen: 20000,
          cardSen: 5000,
          transferSen: 0,
          ewalletSen: 0,
          otaPrepaidSen: 0,
          chargeToAccountSen: 0,
          depositsSen: 0,
          refundsSen: 0,
          receivablesSettledSen: 0,
        },
        expenses: [
          { category: "Cleaning", amountSen: 3000, paidBy: "cash" },
          { category: "Transport", amountSen: 2000, paidBy: "card" }, // card — does NOT reduce cash
        ],
      }),
    ];
    const drawings = [{ direction: "drawing" as const, amountSen: 5000 }];
    const injections = [{ direction: "injection" as const, amountSen: 1000 }];

    const result = cashMovement({ openingFloatSen: 10000, nightDays: days, drawings, injections });
    expect(result.openingSen).toBe(10000);
    expect(result.collectionsSen).toBe(20000);
    expect(result.cashExpensesSen).toBe(3000); // card expense excluded
    expect(result.drawingsSen).toBe(5000);
    expect(result.injectionsSen).toBe(1000);
    // closing = 10000 + 20000 - 3000 - 5000 + 1000 = 23000
    expect(result.closingSen).toBe(23000);
  });

  it("handles negative closing (more drawn than collected)", () => {
    const days = [makeDay({ collections: { cashSen: 1000, cardSen: 0, transferSen: 0, ewalletSen: 0, otaPrepaidSen: 0, chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0 }, expenses: [] })];
    const result = cashMovement({
      openingFloatSen: 0,
      nightDays: days,
      drawings: [{ direction: "drawing", amountSen: 50000 }],
      injections: [],
    });
    expect(result.closingSen).toBe(1000 - 50000);
    expect(result.closingSen).toBeLessThan(0);
  });

  it("empty days, drawings, injections returns zeroed statement", () => {
    const result = cashMovement({ openingFloatSen: 5000, nightDays: [], drawings: [], injections: [] });
    expect(result.collectionsSen).toBe(0);
    expect(result.cashExpensesSen).toBe(0);
    expect(result.drawingsSen).toBe(0);
    expect(result.injectionsSen).toBe(0);
    expect(result.closingSen).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// collectionsByChannel
// ---------------------------------------------------------------------------

describe("collectionsByChannel", () => {
  it("maps night collection fields to channel names", () => {
    const days = [
      makeDay({
        collections: {
          cashSen: 10000,
          cardSen: 5000,
          transferSen: 0,
          ewalletSen: 3000,
          otaPrepaidSen: 2000,
          chargeToAccountSen: 1000,
          depositsSen: 0,
          refundsSen: 0,
          receivablesSettledSen: 0,
        },
      }),
    ];
    const result = collectionsByChannel(days, [], new Map());
    const byChannel = new Map(result.map((c) => [c.channel, c.amountSen]));
    expect(byChannel.get("Cash")).toBe(10000);
    expect(byChannel.get("Card")).toBe(5000);
    expect(byChannel.get("E-wallet")).toBe(3000);
    expect(byChannel.get("OTA prepaid")).toBe(2000);
    expect(byChannel.get("Charge to account")).toBe(1000);
    expect(byChannel.has("Bank transfer")).toBe(false); // zero filtered out
  });

  it("merges overlapping channels from night + standalone", () => {
    const days = [
      makeDay({
        collections: {
          cashSen: 5000,
          cardSen: 0,
          transferSen: 0,
          ewalletSen: 0,
          otaPrepaidSen: 0,
          chargeToAccountSen: 0,
          depositsSen: 0,
          refundsSen: 0,
          receivablesSettledSen: 0,
        },
      }),
    ];
    const standalone: StandaloneEntry[] = [
      { amountSen: 3000, linkedBusinessDayId: null, categoryId: "cat1", paymentMethodId: "pm-cash" },
    ];
    const pmTypeMap = new Map([["pm-cash", "cash"]]);
    const result = collectionsByChannel(days, standalone, pmTypeMap);
    const cash = result.find((c) => c.channel === "Cash");
    expect(cash?.amountSen).toBe(8000); // 5000 + 3000
  });

  it("excludes linked standalone entries", () => {
    const days: NightDayDoc[] = [];
    const standalone: StandaloneEntry[] = [
      { amountSen: 9999, linkedBusinessDayId: "some-day", categoryId: "cat1", paymentMethodId: "pm-cash" },
    ];
    const pmTypeMap = new Map([["pm-cash", "cash"]]);
    const result = collectionsByChannel(days, standalone, pmTypeMap);
    expect(result).toHaveLength(0);
  });

  it("empty input returns empty array", () => {
    expect(collectionsByChannel([], [], new Map())).toHaveLength(0);
  });

  it("sorts descending by amountSen", () => {
    const days = [
      makeDay({
        collections: {
          cashSen: 100,
          cardSen: 5000,
          transferSen: 300,
          ewalletSen: 0,
          otaPrepaidSen: 0,
          chargeToAccountSen: 0,
          depositsSen: 0,
          refundsSen: 0,
          receivablesSettledSen: 0,
        },
      }),
    ];
    const result = collectionsByChannel(days, [], new Map());
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].amountSen).toBeGreaterThanOrEqual(result[i].amountSen);
    }
  });
});

// ---------------------------------------------------------------------------
// occupancy
// ---------------------------------------------------------------------------

describe("occupancy", () => {
  it("computes occupancy, ADR, RevPAR correctly", () => {
    const days = [
      makeDay({ rooms: { available: 10, sold: 8, houseUse: 0, revenueSen: 80000 } }),
      makeDay({ rooms: { available: 10, sold: 6, houseUse: 0, revenueSen: 60000 } }),
    ];
    const result = occupancy(days, null);
    expect(result.soldTotal).toBe(14);
    expect(result.availableTotal).toBe(20);
    expect(result.roomRevenueSen).toBe(140000);
    expect(result.occupancyRatio).toBeCloseTo(14 / 20, 5);
    expect(result.adrSen).toBe(Math.round(140000 / 14)); // 10000
    expect(result.revparSen).toBe(Math.round(140000 / 20)); // 7000
  });

  it("uses roomsAvailableFallback when rooms.available is 0", () => {
    const days = [
      makeDay({ rooms: { available: 0, sold: 5, houseUse: 0, revenueSen: 50000 } }),
    ];
    const result = occupancy(days, 10);
    expect(result.availableTotal).toBe(10); // fallback used
    expect(result.soldTotal).toBe(5);
  });

  it("falls back to 0 available when both sources are 0/null", () => {
    const days = [
      makeDay({ rooms: { available: 0, sold: 3, houseUse: 0, revenueSen: 30000 } }),
    ];
    const result = occupancy(days, null);
    expect(result.availableTotal).toBe(0);
    expect(result.occupancyRatio).toBe(0); // no available rooms → ratio 0
  });

  it("returns all zeros for empty input", () => {
    const result = occupancy([], null);
    expect(result.soldTotal).toBe(0);
    expect(result.availableTotal).toBe(0);
    expect(result.roomRevenueSen).toBe(0);
    expect(result.occupancyRatio).toBe(0);
    expect(result.adrSen).toBe(0);
    expect(result.revparSen).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CLAUDE.md rule 6 — drawings and advances are NOT expenses
// ---------------------------------------------------------------------------

describe("drawings classification (CLAUDE.md rule 6)", () => {
  /**
   * A partner drawing reduces cash on hand but must NEVER appear in
   * expensesByCategory and must NOT reduce netProfitSen.
   * It belongs only in cashMovement.drawingsSen (and thus lowers closingSen).
   */
  it("a partner drawing does not appear in expensesByCategory", () => {
    const drawing: PartnerTxn = { direction: "drawing", amountSen: 50000 };

    // No night-report expenses, no standalone expenses — just a drawing.
    const { categories, totalSen } = expensesByCategory([], [], new Map());

    expect(totalSen).toBe(0);
    expect(categories).toHaveLength(0);

    // Now confirm netProfitSen is unchanged by the drawing.
    const revTotal = 100000;
    const expTotal = totalSen; // 0
    const profit = netProfitSen(revTotal, expTotal);
    expect(profit).toBe(100000); // drawing has zero effect on profit

    // And confirm drawing is captured only in cashMovement.
    const cashMov = cashMovement({
      openingFloatSen: 0,
      nightDays: [],
      drawings: [drawing],
      injections: [],
    });
    expect(cashMov.drawingsSen).toBe(50000);
    expect(cashMov.closingSen).toBe(-50000); // reduces cash
    // Drawings do not contribute to cashExpensesSen.
    expect(cashMov.cashExpensesSen).toBe(0);
  });

  it("a drawing with revenue does not reduce net profit", () => {
    const drawing: PartnerTxn = { direction: "drawing", amountSen: 30000 };
    const day = makeDay({
      rooms: { available: 10, sold: 5, houseUse: 0, revenueSen: 100000 },
      expenses: [], // no operating expenses
    });

    const revSummary = revenueBySource([day], [], new Map());
    const expSummary = expensesByCategory([day], [], new Map());

    // Net profit ignores drawings entirely.
    const profit = netProfitSen(revSummary.totalSen, expSummary.totalSen);
    expect(profit).toBe(100000);

    // Cash movement reflects the drawing.
    const cashMov = cashMovement({
      openingFloatSen: 0,
      nightDays: [day],
      drawings: [drawing],
      injections: [],
    });
    expect(cashMov.drawingsSen).toBe(30000);
    // closingSen is reduced by the drawing, but profit is untouched.
    expect(cashMov.closingSen).toBeLessThan(100000);
  });
});

describe("salary-as-expense classification (CLAUDE.md rule 6)", () => {
  /**
   * A salary recorded as a standalone expense entry in category
   * "Salaries and EPF/SOCSO" IS an operating expense and MUST be included
   * in expensesByCategory and reduce netProfitSen — once and exactly once.
   * The reportSummary functions do not pull from salaryPayments — there is
   * no second code path that could double-count it.
   */
  it("salary expense appears in expensesByCategory and reduces netProfitSen exactly once", () => {
    const SALARY_CAT_ID = "cat-salary";
    const SALARY_CAT_NAME = "Salaries and EPF/SOCSO";
    const SALARY_AMOUNT = 500000; // RM 5,000.00

    // Salary entered as a standalone expense (no linked business day).
    const salaryEntry: StandaloneEntry = {
      amountSen: SALARY_AMOUNT,
      linkedBusinessDayId: null,
      categoryId: SALARY_CAT_ID,
      paymentMethodId: "pm-transfer",
    };
    const catMap = new Map([[SALARY_CAT_ID, SALARY_CAT_NAME]]);

    // Revenue: RM 10,000 room revenue only.
    const day = makeDay({
      rooms: { available: 10, sold: 8, houseUse: 0, revenueSen: 1000000 },
      expenses: [], // no night-report expenses
    });

    const revSummary = revenueBySource([day], [], catMap);
    const expSummary = expensesByCategory([day], [salaryEntry], catMap);

    // Salary appears exactly once in the expense breakdown.
    const salaryLine = expSummary.categories.find((c) => c.name === SALARY_CAT_NAME);
    expect(salaryLine).toBeDefined();
    expect(salaryLine!.amountSen).toBe(SALARY_AMOUNT);

    // Total expenses equal exactly the salary amount — no duplication.
    expect(expSummary.totalSen).toBe(SALARY_AMOUNT);

    // Net profit is reduced by exactly the salary amount.
    const profit = netProfitSen(revSummary.totalSen, expSummary.totalSen);
    expect(profit).toBe(revSummary.totalSen - SALARY_AMOUNT);
    expect(profit).toBe(1000000 - 500000);
  });

  it("salary does not appear when recorded as linked (would double-count a night-report line)", () => {
    // A linked entry (linkedBusinessDayId !== null) should be excluded from
    // standalone totals — this is the double-counting guard from combinedTotalSen.
    const SALARY_CAT_ID = "cat-salary";
    const SALARY_CAT_NAME = "Salaries and EPF/SOCSO";

    const linkedSalaryEntry: StandaloneEntry = {
      amountSen: 200000,
      linkedBusinessDayId: "some-day-id", // linked — must be excluded
      categoryId: SALARY_CAT_ID,
      paymentMethodId: "pm-transfer",
    };
    const catMap = new Map([[SALARY_CAT_ID, SALARY_CAT_NAME]]);

    const expSummary = expensesByCategory([], [linkedSalaryEntry], catMap);
    expect(expSummary.totalSen).toBe(0); // linked entry excluded
    expect(expSummary.categories).toHaveLength(0);
  });
});

describe("lateSubmissionCount", () => {
  // KL wall-clock minus 8h = UTC.
  const at = (y: number, m: number, d: number, h: number) =>
    new Date(Date.UTC(y, m - 1, d, h - 8));

  it("counts reports filed more than the threshold hours after the day ended", () => {
    const days = [
      // Business date 2 Sep (cutoff 6 -> ends 3 Sep 06:00). Filed 03:00 next
      // day = on time (~-3h).
      { date: "2026-09-02", submittedAt: at(2026, 9, 3, 3) },
      // Filed 14:00 next day = +8h, not late at a 12h threshold.
      { date: "2026-09-03", submittedAt: at(2026, 9, 4, 14) },
      // Filed 20:00 next day = +14h, late.
      { date: "2026-09-04", submittedAt: at(2026, 9, 5, 20) },
    ];
    expect(lateSubmissionCount(days, 6, 12)).toBe(1);
  });

  it("respects a different threshold", () => {
    const days = [{ date: "2026-09-02", submittedAt: at(2026, 9, 3, 14) }]; // +8h
    expect(lateSubmissionCount(days, 6, 6)).toBe(1); // late at 6h
    expect(lateSubmissionCount(days, 6, 12)).toBe(0); // on time at 12h
  });

  it("skips reports with no submittedAt", () => {
    const days = [
      { date: "2026-09-02", submittedAt: null },
      { date: "2026-09-03", submittedAt: at(2026, 9, 4, 22) }, // +16h, late
    ];
    expect(lateSubmissionCount(days, 6, 12)).toBe(1);
  });

  it("is zero for an empty period", () => {
    expect(lateSubmissionCount([], 6, 12)).toBe(0);
  });
});
