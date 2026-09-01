import { describe, it, expect } from "vitest";
import { combinedTotalSen } from "./reporting";

describe("combinedTotalSen", () => {
  it("sums night report lines and standalone entries together", () => {
    const total = combinedTotalSen(
      [10000, 5000],
      [{ amountSen: 2000, linkedBusinessDayId: null }],
    );
    expect(total).toBe(17000);
  });

  it("excludes a standalone entry already linked to a night report — the exact double-counting bug this prevents", () => {
    const total = combinedTotalSen(
      [10000],
      [
        { amountSen: 2000, linkedBusinessDayId: null }, // genuinely standalone
        { amountSen: 9999, linkedBusinessDayId: "biz-day-1" }, // already in the 10000
      ],
    );
    expect(total).toBe(12000); // 10000 + 2000, NOT + 9999
  });

  it("handles no night report activity", () => {
    expect(combinedTotalSen([], [{ amountSen: 500, linkedBusinessDayId: null }])).toBe(500);
  });

  it("handles no standalone entries", () => {
    expect(combinedTotalSen([10000, 500], [])).toBe(10500);
  });

  it("handles a fully empty day", () => {
    expect(combinedTotalSen([], [])).toBe(0);
  });
});
