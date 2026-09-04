import { describe, it, expect } from "vitest";
import {
  enumerateDates,
  buildDailyRow,
  dailyBreakdownTotals,
  dailyChannelSummary,
  groupRowsByMonth,
  buildRevenueDetail,
  buildExpenseDetail,
  type RawNightDay,
} from "./dailyBreakdown";

function makeDay(overrides: Partial<RawNightDay> = {}): RawNightDay {
  return {
    id: "day1",
    date: "2026-09-03",
    status: "submitted",
    rooms: { available: 10, sold: 6, houseUse: 0, revenueSen: 60000 },
    revenueLines: [],
    otaBookings: [],
    collections: {
      cashSen: 0,
      cardSen: 0,
      transferSen: 0,
      ewalletSen: 0,
      chargeToAccountSen: 0,
      depositsSen: 0,
      refundsSen: 0,
      receivablesSettledSen: 0,
    },
    expenses: [],
    ...overrides,
  };
}

describe("enumerateDates", () => {
  it("lists every date inclusive, ascending", () => {
    expect(enumerateDates("2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("handles a single-day range", () => {
    expect(enumerateDates("2026-09-01", "2026-09-01")).toEqual(["2026-09-01"]);
  });

  it("crosses a month boundary", () => {
    expect(enumerateDates("2026-08-30", "2026-09-01")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});

describe("buildDailyRow", () => {
  it("marks a date with no document as missing, but still surfaces standalone expenses", () => {
    const row = buildDailyRow("2026-09-03", null, 5000, 10);
    expect(row.status).toBe("missing");
    expect(row.businessDayId).toBeNull();
    expect(row.totalRevenueSen).toBe(0);
    expect(row.expensesSen).toBe(5000);
    expect(row.varianceSen).toBeNull();
    expect(row.label).toBe("Thu 3 Sep");
  });

  it("combines night-report and standalone expenses for a real day", () => {
    const day = makeDay({
      expenses: [{ category: "Transport", amountSen: 2000, paidBy: "cash" }],
    });
    const row = buildDailyRow("2026-09-03", day, 3000, null);
    expect(row.expensesSen).toBe(5000);
    expect(row.status).toBe("submitted");
    expect(row.businessDayId).toBe("day1");
  });

  it("falls back to the settings room count only when the day recorded zero available", () => {
    const day = makeDay({ rooms: { available: 0, sold: 4, houseUse: 0, revenueSen: 40000 } });
    const row = buildDailyRow("2026-09-03", day, 0, 20);
    expect(row.roomsAvailable).toBe(20);
    expect(row.occupancyRatio).toBeCloseTo(0.2);
  });

  it("total revenue is rooms + revenue lines, never additive with OTA room revenue", () => {
    const day = makeDay({
      rooms: { available: 10, sold: 6, houseUse: 0, revenueSen: 60000 },
      revenueLines: [{ category: "Laundry", amountSen: 1000 }],
      otaBookings: [
        { platformId: "p1", bookingsCount: 1, roomRevenueSen: 20000, guestPaidPlatform: true },
      ],
    });
    const row = buildDailyRow("2026-09-03", day, 0, null);
    expect(row.totalRevenueSen).toBe(61000);
    expect(row.otaReceivableSen).toBe(20000);
  });

  it("flags self-approval and backdating from the raw document", () => {
    const day = makeDay({ submittedBy: "u1", approvedBy: "u1", enteredLate: true });
    const row = buildDailyRow("2026-09-03", day, 0, null);
    expect(row.selfApproved).toBe(true);
    expect(row.backdated).toBe(true);
  });
});

describe("dailyBreakdownTotals", () => {
  it("sums every numeric column and counts missing days", () => {
    const rows = [
      buildDailyRow("2026-09-01", makeDay({ collections: { cashSen: 1000, cardSen: 500, transferSen: 0, ewalletSen: 0, chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0 } }), 0, null),
      buildDailyRow("2026-09-02", null, 200, null),
    ];
    const totals = dailyBreakdownTotals(rows);
    expect(totals.cashSen).toBe(1000);
    expect(totals.cardSen).toBe(500);
    expect(totals.expensesSen).toBe(200);
    expect(totals.missingCount).toBe(1);
    expect(totals.roomsSold).toBe(6);
    expect(totals.roomsAvailable).toBe(10);
  });

  it("occupancy is null when no rooms were available at all", () => {
    const rows = [buildDailyRow("2026-09-01", null, 0, null)];
    expect(dailyBreakdownTotals(rows).occupancyRatio).toBeNull();
  });
});

describe("dailyChannelSummary", () => {
  it("computes percentage of the five-channel total", () => {
    const day = makeDay({
      collections: {
        cashSen: 300,
        cardSen: 100,
        transferSen: 500,
        ewalletSen: 100,
        chargeToAccountSen: 0,
        depositsSen: 0,
        refundsSen: 0,
        receivablesSettledSen: 0,
      },
    });
    const rows = [buildDailyRow("2026-09-01", day, 0, null)];
    const summary = dailyChannelSummary(rows);
    const byChannel = Object.fromEntries(summary.map((s) => [s.channel, s]));
    expect(byChannel["Cash"].amountSen).toBe(300);
    expect(byChannel["Cash"].pct).toBe(30);
    expect(byChannel["DuitNow / QR"].pct).toBe(50);
    expect(byChannel["OTA"].amountSen).toBe(0);
  });

  it("includes OTA receivable as its own channel", () => {
    const day = makeDay({
      collections: {
        cashSen: 500,
        cardSen: 0,
        transferSen: 0,
        ewalletSen: 0,
        chargeToAccountSen: 0,
        depositsSen: 0,
        refundsSen: 0,
        receivablesSettledSen: 0,
      },
      otaBookings: [
        { platformId: "p1", bookingsCount: 1, roomRevenueSen: 500, guestPaidPlatform: true },
      ],
    });
    const rows = [buildDailyRow("2026-09-01", day, 0, null)];
    const byChannel = Object.fromEntries(
      dailyChannelSummary(rows).map((s) => [s.channel, s]),
    );
    expect(byChannel["OTA"].amountSen).toBe(500);
    expect(byChannel["OTA"].pct).toBe(50);
    expect(byChannel["Cash"].pct).toBe(50);
  });

  it("percentages are all zero when there is no collection data", () => {
    const rows = [buildDailyRow("2026-09-01", null, 0, null)];
    for (const s of dailyChannelSummary(rows)) {
      expect(s.pct).toBe(0);
      expect(s.amountSen).toBe(0);
    }
  });
});

describe("groupRowsByMonth", () => {
  it("groups days into calendar months, sorted ascending", () => {
    const rows = [
      buildDailyRow("2026-08-31", makeDay({ rooms: { available: 10, sold: 5, houseUse: 0, revenueSen: 50000 } }), 0, null),
      buildDailyRow("2026-09-01", makeDay({ rooms: { available: 10, sold: 4, houseUse: 0, revenueSen: 40000 } }), 0, null),
      buildDailyRow("2026-09-02", null, 1000, null),
    ];
    const months = groupRowsByMonth(rows);
    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(months[0].label).toBe("Aug 2026");
    expect(months[0].dayRows).toHaveLength(1);
    expect(months[1].dayRows).toHaveLength(2);
    expect(months[1].totalRevenueSen).toBe(40000);
    expect(months[1].expensesSen).toBe(1000);
    expect(months[1].missingCount).toBe(1);
  });

  it("aggregates occupancy from summed sold/available, not an average of ratios", () => {
    const rows = [
      buildDailyRow("2026-09-01", makeDay({ rooms: { available: 10, sold: 5, houseUse: 0, revenueSen: 0 } }), 0, null),
      buildDailyRow("2026-09-02", makeDay({ rooms: { available: 20, sold: 5, houseUse: 0, revenueSen: 0 } }), 0, null),
    ];
    const months = groupRowsByMonth(rows);
    // 10 sold / 30 available, not (50% + 25%) / 2.
    expect(months[0].occupancyRatio).toBeCloseTo(1 / 3);
  });
});

describe("buildRevenueDetail", () => {
  it("splits room revenue into direct and OTA, and totals rooms + revenue lines", () => {
    const day = makeDay({
      rooms: { available: 10, sold: 6, houseUse: 0, revenueSen: 60000 },
      revenueLines: [{ category: "Laundry", amountSen: 1500 }],
      otaBookings: [
        { platformId: "p1", bookingsCount: 2, roomRevenueSen: 25000, guestPaidPlatform: true },
      ],
    });
    const detail = buildRevenueDetail(day, new Map([["p1", "Agoda"]]));
    expect(detail.roomRevenueOtaSen).toBe(25000);
    expect(detail.roomRevenueDirectSen).toBe(35000);
    expect(detail.totalSen).toBe(61500);
    expect(detail.otaBookings[0].platformName).toBe("Agoda");
  });

  it("labels an unresolvable platform id rather than throwing", () => {
    const day = makeDay({
      otaBookings: [
        { platformId: "gone", bookingsCount: 1, roomRevenueSen: 10000, guestPaidPlatform: false },
      ],
    });
    const detail = buildRevenueDetail(day, new Map());
    expect(detail.otaBookings[0].platformName).toBe("Unknown platform");
  });
});

describe("buildExpenseDetail", () => {
  it("combines night-report lines with standalone entries dated that day", () => {
    const nightExpenses = [
      { category: "Transport", amountSen: 2000, paidTo: "Grab", paidBy: "cash" as const },
    ];
    const standalone = [
      {
        categoryId: "c1",
        amountSen: 5000,
        paymentMethodId: "pm1",
        paidTo: "TNB",
        linkedBusinessDayId: null,
      },
    ];
    const detail = buildExpenseDetail(
      nightExpenses,
      standalone,
      new Map([["c1", "Utilities"]]),
      new Map([["pm1", "DuitNow QR"]]),
    );
    expect(detail.lines).toHaveLength(2);
    expect(detail.totalSen).toBe(7000);
    expect(detail.lines[0]).toMatchObject({ source: "night", paymentMethodLabel: "Cash" });
    expect(detail.lines[1]).toMatchObject({
      source: "standalone",
      category: "Utilities",
      paymentMethodLabel: "DuitNow QR",
    });
  });

  it("excludes a standalone entry already linked to a business day", () => {
    const standalone = [
      { categoryId: "c1", amountSen: 5000, paymentMethodId: "pm1", linkedBusinessDayId: "day1" },
    ];
    const detail = buildExpenseDetail([], standalone, new Map(), new Map());
    expect(detail.lines).toHaveLength(0);
    expect(detail.totalSen).toBe(0);
  });

  it("shows an em dash when paidTo is blank", () => {
    const nightExpenses = [{ category: "Misc", amountSen: 100, paidTo: "  ", paidBy: "card" as const }];
    const detail = buildExpenseDetail(nightExpenses, [], new Map(), new Map());
    expect(detail.lines[0].paidTo).toBe("—");
  });
});
