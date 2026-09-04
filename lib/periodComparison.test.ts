import { describe, it, expect } from "vitest";
import { compareValues, formatMoneyDelta, formatOccupancyDelta } from "./periodComparison";

describe("compareValues", () => {
  it("computes a positive delta and percentage", () => {
    const c = compareValues(150000, 100000);
    expect(c.deltaValue).toBe(50000);
    expect(c.deltaPct).toBe(50);
  });

  it("computes a negative delta and percentage", () => {
    const c = compareValues(80000, 100000);
    expect(c.deltaValue).toBe(-20000);
    expect(c.deltaPct).toBe(-20);
  });

  it("returns null deltaPct when the previous value is zero", () => {
    const c = compareValues(50000, 0);
    expect(c.deltaValue).toBe(50000);
    expect(c.deltaPct).toBeNull();
  });

  it("is all zero when nothing changed", () => {
    const c = compareValues(0, 0);
    expect(c.deltaValue).toBe(0);
    expect(c.deltaPct).toBeNull();
  });

  it("handles a negative previous value using its magnitude for the percentage base", () => {
    const c = compareValues(-50, -100);
    expect(c.deltaValue).toBe(50);
    expect(c.deltaPct).toBe(50);
  });
});

describe("formatMoneyDelta", () => {
  it("formats a positive change with both amount and percentage", () => {
    expect(formatMoneyDelta(150000, 100000)).toBe("+RM 500.00 (+50%) vs previous period");
  });

  it("formats a negative change with a minus sign", () => {
    expect(formatMoneyDelta(80000, 100000)).toBe("−RM 200.00 (−20%) vs previous period");
  });

  it("reports no prior data when the previous period was zero and current is not", () => {
    expect(formatMoneyDelta(50000, 0)).toBe("No data for previous period");
  });

  it("reports no change when both periods are zero", () => {
    expect(formatMoneyDelta(0, 0)).toBe("No change vs previous period");
  });
});

describe("formatOccupancyDelta", () => {
  it("formats a positive percentage-point change", () => {
    expect(formatOccupancyDelta(0.65, 0.5)).toBe("+15pp vs previous period");
  });

  it("formats a negative percentage-point change", () => {
    expect(formatOccupancyDelta(0.4, 0.5)).toBe("−10pp vs previous period");
  });

  it("is undefined when there is no current-period occupancy to show", () => {
    expect(formatOccupancyDelta(null, 0.5)).toBeUndefined();
  });

  it("reports no prior data when the previous period has none", () => {
    expect(formatOccupancyDelta(0.5, null)).toBe("No data for previous period");
  });

  it("reports no change when the ratio is identical", () => {
    expect(formatOccupancyDelta(0.5, 0.5)).toBe("No change vs previous period");
  });
});
