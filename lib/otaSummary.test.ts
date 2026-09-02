import { describe, it, expect } from "vitest";
import {
  otaBookingsSummary,
  otaPlatformBalances,
  commissionShortfallSen,
} from "./otaSummary";

describe("otaBookingsSummary", () => {
  it("sums bookings and revenue booked per platform, across days", () => {
    const nightDays = [
      {
        otaBookings: [
          { platformId: "agoda", bookingsCount: 2, roomRevenueSen: 30000, guestPaidPlatform: true },
          { platformId: "booking", bookingsCount: 1, roomRevenueSen: 12000, guestPaidPlatform: false },
        ],
      },
      {
        otaBookings: [
          { platformId: "agoda", bookingsCount: 1, roomRevenueSen: 15000, guestPaidPlatform: true },
        ],
      },
    ];
    const result = otaBookingsSummary(nightDays);
    const byPlatform = new Map(result.map((r) => [r.platformId, r]));
    expect(byPlatform.get("agoda")).toEqual({
      platformId: "agoda",
      bookingsCount: 3,
      revenueBookedSen: 45000,
    });
    expect(byPlatform.get("booking")).toEqual({
      platformId: "booking",
      bookingsCount: 1,
      revenueBookedSen: 12000,
    });
  });

  it("counts revenue booked regardless of who paid — a period metric, not a receivable", () => {
    const nightDays = [
      { otaBookings: [{ platformId: "agoda", bookingsCount: 1, roomRevenueSen: 10000, guestPaidPlatform: false }] },
    ];
    const result = otaBookingsSummary(nightDays);
    expect(result[0].revenueBookedSen).toBe(10000);
  });

  it("returns an empty array for no nights", () => {
    expect(otaBookingsSummary([])).toHaveLength(0);
  });
});

describe("otaPlatformBalances", () => {
  it("computes outstanding as receivable added minus covered, all-time", () => {
    const allNightDays = [
      { otaBookings: [{ platformId: "agoda", bookingsCount: 1, roomRevenueSen: 20000, guestPaidPlatform: true }] },
      { otaBookings: [{ platformId: "agoda", bookingsCount: 1, roomRevenueSen: 5000, guestPaidPlatform: false }] }, // guest-paid-us — excluded
    ];
    const allRemittances = [
      { platformId: "agoda", amountReceivedSen: 18000, outstandingCoveredSen: 20000 },
    ];
    const balances = otaPlatformBalances(allNightDays, allRemittances);
    expect(balances.get("agoda")).toEqual({
      platformId: "agoda",
      receivableAddedSen: 20000,
      receivedSen: 18000,
      outstandingSen: 0,
    });
  });

  it("a platform with no remittances yet shows its full receivable as outstanding", () => {
    const allNightDays = [
      { otaBookings: [{ platformId: "trip", bookingsCount: 1, roomRevenueSen: 9000, guestPaidPlatform: true }] },
    ];
    const balances = otaPlatformBalances(allNightDays, []);
    expect(balances.get("trip")?.outstandingSen).toBe(9000);
    expect(balances.get("trip")?.receivedSen).toBe(0);
  });

  it("a partial remittance reduces outstanding by what it covers, not by what was received", () => {
    const allNightDays = [
      { otaBookings: [{ platformId: "agoda", bookingsCount: 2, roomRevenueSen: 40000, guestPaidPlatform: true }] },
    ];
    // First remittance covers half the outstanding, with a commission shortfall.
    const allRemittances = [
      { platformId: "agoda", amountReceivedSen: 18000, outstandingCoveredSen: 20000 },
    ];
    const balances = otaPlatformBalances(allNightDays, allRemittances);
    expect(balances.get("agoda")?.outstandingSen).toBe(20000); // 40000 - 20000 covered
    expect(balances.get("agoda")?.receivedSen).toBe(18000);
  });

  it("aggregates multiple remittances for the same platform", () => {
    const allNightDays = [
      { otaBookings: [{ platformId: "agoda", bookingsCount: 2, roomRevenueSen: 40000, guestPaidPlatform: true }] },
    ];
    const allRemittances = [
      { platformId: "agoda", amountReceivedSen: 18000, outstandingCoveredSen: 20000 },
      { platformId: "agoda", amountReceivedSen: 20000, outstandingCoveredSen: 20000 },
    ];
    const balances = otaPlatformBalances(allNightDays, allRemittances);
    expect(balances.get("agoda")?.outstandingSen).toBe(0);
    expect(balances.get("agoda")?.receivedSen).toBe(38000);
  });
});

describe("commissionShortfallSen", () => {
  it("is the gap between what was covered and what arrived", () => {
    expect(commissionShortfallSen(20000, 18000)).toBe(2000);
  });

  it("is zero when the full covered amount arrived", () => {
    expect(commissionShortfallSen(20000, 20000)).toBe(0);
  });

  it("is never negative, even on an overpayment", () => {
    expect(commissionShortfallSen(20000, 25000)).toBe(0);
  });
});
