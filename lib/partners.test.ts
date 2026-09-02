import { describe, it, expect } from "vitest";
import {
  validateShareSet,
  sharesActiveOn,
  summariseTransactions,
  computePartnerBalanceSen,
  formatBp,
  PERCENT_BP_TOTAL,
} from "./partners";

describe("validateShareSet", () => {
  it("accepts a set that totals exactly 100% (integers)", () => {
    const r = validateShareSet([
      { partnerId: "a", percentageBp: 5000 },
      { partnerId: "b", percentageBp: 3000 },
      { partnerId: "c", percentageBp: 2000 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.totalBp).toBe(PERCENT_BP_TOTAL);
  });

  it("accepts a 33.33 / 33.33 / 33.34 split (exact in basis points)", () => {
    const r = validateShareSet([
      { partnerId: "a", percentageBp: 3333 },
      { partnerId: "b", percentageBp: 3333 },
      { partnerId: "c", percentageBp: 3334 },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects a set that totals 99.99%", () => {
    const r = validateShareSet([
      { partnerId: "a", percentageBp: 5000 },
      { partnerId: "b", percentageBp: 4999 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("100%");
    expect(r.error).toContain("99.99");
  });

  it("rejects a set that totals over 100%", () => {
    const r = validateShareSet([
      { partnerId: "a", percentageBp: 6000 },
      { partnerId: "b", percentageBp: 5000 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a duplicate partner", () => {
    const r = validateShareSet([
      { partnerId: "a", percentageBp: 5000 },
      { partnerId: "a", percentageBp: 5000 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/more than once/i);
  });

  it("rejects a zero or negative share", () => {
    expect(validateShareSet([{ partnerId: "a", percentageBp: 0 }]).ok).toBe(false);
    expect(validateShareSet([{ partnerId: "a", percentageBp: -100 }]).ok).toBe(false);
  });

  it("rejects an empty set", () => {
    expect(validateShareSet([]).ok).toBe(false);
  });
});

describe("sharesActiveOn (half-open intervals)", () => {
  const rows = [
    { partnerId: "a", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-01" },
    { partnerId: "a", effectiveFrom: "2026-06-01", effectiveTo: null },
  ];

  it("returns the current (open) row for a date after the change", () => {
    const active = sharesActiveOn(rows, "2026-09-02");
    expect(active).toHaveLength(1);
    expect(active[0].effectiveTo).toBeNull();
  });

  it("returns the old row for a date before the change", () => {
    const active = sharesActiveOn(rows, "2026-03-01");
    expect(active).toHaveLength(1);
    expect(active[0].effectiveTo).toBe("2026-06-01");
  });

  it("on the boundary date, only the new row is active (never both)", () => {
    const active = sharesActiveOn(rows, "2026-06-01");
    expect(active).toHaveLength(1);
    expect(active[0].effectiveTo).toBeNull();
  });

  it("returns nothing before the first effectiveFrom", () => {
    expect(sharesActiveOn(rows, "2025-12-31")).toHaveLength(0);
  });
});

describe("summariseTransactions", () => {
  it("sums amounts by direction", () => {
    const t = summariseTransactions([
      { direction: "injection", amountSen: 500000 },
      { direction: "injection", amountSen: 250000 },
      { direction: "drawing", amountSen: 100000 },
    ]);
    expect(t.injectionsSen).toBe(750000);
    expect(t.drawingsSen).toBe(100000);
  });

  it("is zero for no transactions", () => {
    expect(summariseTransactions([])).toEqual({ injectionsSen: 0, drawingsSen: 0 });
  });
});

describe("computePartnerBalanceSen", () => {
  it("is allocated + injections − drawings", () => {
    expect(
      computePartnerBalanceSen({ allocatedSen: 0, injectionsSen: 750000, drawingsSen: 100000 }),
    ).toBe(650000);
  });

  it("goes negative when drawings exceed what's earned (the number you want visible)", () => {
    expect(
      computePartnerBalanceSen({ allocatedSen: 0, injectionsSen: 0, drawingsSen: 300000 }),
    ).toBe(-300000);
  });
});

describe("formatBp", () => {
  it("renders basis points as a percentage string", () => {
    expect(formatBp(10000)).toBe("100.00");
    expect(formatBp(3333)).toBe("33.33");
    expect(formatBp(50)).toBe("0.50");
    expect(formatBp(9999)).toBe("99.99");
  });
});
