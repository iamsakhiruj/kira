import { describe, it, expect } from "vitest";
import {
  allocateProfit,
  monthEndDate,
  sumEffectiveLockedByPartner,
  type ShareInput,
} from "./profitAllocation";

const THREE: ShareInput[] = [
  { partnerId: "a", percentageBp: 5000 },
  { partnerId: "b", percentageBp: 3000 },
  { partnerId: "c", percentageBp: 2000 },
];

function sum(rows: { amountSen: number }[]): number {
  return rows.reduce((s, r) => s + r.amountSen, 0);
}

describe("allocateProfit", () => {
  it("splits a clean 50/30/20 with no remainder", () => {
    const r = allocateProfit(1_000_000, THREE);
    expect(r.map((x) => x.amountSen)).toEqual([500000, 300000, 200000]);
    expect(sum(r)).toBe(1_000_000);
  });

  it("distributes the remainder so parts sum EXACTLY to net profit", () => {
    // 100 sen on 50/30/20: 50, 30, 20 — clean. Use an awkward figure instead.
    // 101 sen: exact 50.5 / 30.3 / 20.2 -> floors 50/30/20 = 100, leftover 1.
    // remainders: a=5000, b=3000, c=2000 -> +1 to a (largest).
    const r = allocateProfit(101, THREE);
    expect(sum(r)).toBe(101);
    const byId = Object.fromEntries(r.map((x) => [x.partnerId, x.amountSen]));
    expect(byId.a).toBe(51);
    expect(byId.b).toBe(30);
    expect(byId.c).toBe(20);
  });

  it("keeps thirds exact (33.33/33.33/33.34) and sums to net profit", () => {
    const thirds: ShareInput[] = [
      { partnerId: "a", percentageBp: 3333 },
      { partnerId: "b", percentageBp: 3333 },
      { partnerId: "c", percentageBp: 3334 },
    ];
    const r = allocateProfit(100_000, thirds);
    expect(sum(r)).toBe(100_000);
    // Every share within a sen of its exact value.
    for (const x of r) {
      const exact = (100_000 * x.percentageBp) / 10000;
      expect(Math.abs(x.amountSen - exact)).toBeLessThan(1);
    }
  });

  it("handles a loss month (negative net profit) and still sums exactly", () => {
    const r = allocateProfit(-101, THREE);
    expect(sum(r)).toBe(-101);
    const byId = Object.fromEntries(r.map((x) => [x.partnerId, x.amountSen]));
    // Floors toward −∞: a=-51, b=-31, c=-21 sums to -103; +1 to the two
    // largest remainders brings it to -101.
    expect(byId.a + byId.b + byId.c).toBe(-101);
    expect(byId.a).toBeLessThan(0);
  });

  it("breaks remainder ties deterministically by partnerId", () => {
    const even: ShareInput[] = [
      { partnerId: "z", percentageBp: 5000 },
      { partnerId: "a", percentageBp: 5000 },
    ];
    // 1 sen, 50/50: floors 0/0, leftover 1, equal remainders -> goes to "a".
    const r = allocateProfit(1, even);
    expect(sum(r)).toBe(1);
    const byId = Object.fromEntries(r.map((x) => [x.partnerId, x.amountSen]));
    expect(byId.a).toBe(1);
    expect(byId.z).toBe(0);
  });

  it("rejects a share set that doesn't total 100%", () => {
    expect(() =>
      allocateProfit(1000, [
        { partnerId: "a", percentageBp: 5000 },
        { partnerId: "b", percentageBp: 4000 },
      ]),
    ).toThrow(/100%/);
  });

  it("rejects an empty share set", () => {
    expect(() => allocateProfit(1000, [])).toThrow();
  });

  it("allocates zero across partners as all zeros", () => {
    const r = allocateProfit(0, THREE);
    expect(sum(r)).toBe(0);
    expect(r.every((x) => x.amountSen === 0)).toBe(true);
  });
});

describe("sumEffectiveLockedByPartner", () => {
  const line = (partnerId: string, amountSen: number) => ({ partnerId, amountSen });

  it("ignores draft allocations entirely", () => {
    const m = sumEffectiveLockedByPartner([
      { id: "1", status: "draft", adjustmentOf: null, lines: [line("a", 100)] },
    ]);
    expect(m.size).toBe(0);
  });

  it("sums locked allocations across months per partner", () => {
    const m = sumEffectiveLockedByPartner([
      { id: "1", status: "locked", adjustmentOf: null, lines: [line("a", 100), line("b", 50)] },
      { id: "2", status: "locked", adjustmentOf: null, lines: [line("a", 30)] },
    ]);
    expect(m.get("a")).toBe(130);
    expect(m.get("b")).toBe(50);
  });

  it("counts a locked adjustment instead of the original it replaces", () => {
    const m = sumEffectiveLockedByPartner([
      { id: "1", status: "locked", adjustmentOf: null, lines: [line("a", 100)] },
      { id: "2", status: "locked", adjustmentOf: "1", lines: [line("a", 120)] },
    ]);
    // Original (1) is superseded by adjustment (2) — count 120, not 220.
    expect(m.get("a")).toBe(120);
  });

  it("keeps the original when its adjustment is still a draft", () => {
    const m = sumEffectiveLockedByPartner([
      { id: "1", status: "locked", adjustmentOf: null, lines: [line("a", 100)] },
      { id: "2", status: "draft", adjustmentOf: "1", lines: [line("a", 120)] },
    ]);
    expect(m.get("a")).toBe(100);
  });
});

describe("monthEndDate", () => {
  it("returns the last calendar day", () => {
    expect(monthEndDate("2026-09")).toBe("2026-09-30");
    expect(monthEndDate("2026-02")).toBe("2026-02-28");
    expect(monthEndDate("2028-02")).toBe("2028-02-29");
    expect(monthEndDate("2026-12")).toBe("2026-12-31");
  });
  it("rejects a bad month", () => {
    expect(() => monthEndDate("2026-13")).toThrow();
  });
});
