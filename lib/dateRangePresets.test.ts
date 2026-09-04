import { describe, it, expect } from "vitest";
import {
  lastDayOfMonthStr,
  thisMonthRange,
  todayRange,
  thisWeekRange,
  previousEquivalentRange,
  detectPreset,
} from "./dateRangePresets";

describe("todayRange", () => {
  it("is a single-day range", () => {
    expect(todayRange("2026-09-03")).toEqual({ from: "2026-09-03", to: "2026-09-03" });
  });
});

describe("thisWeekRange", () => {
  it("returns Monday..Sunday when today is mid-week", () => {
    // 2026-09-03 is a Thursday.
    expect(thisWeekRange("2026-09-03")).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });

  it("returns the same week when today is Monday", () => {
    expect(thisWeekRange("2026-08-31")).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });

  it("returns the same week when today is Sunday", () => {
    expect(thisWeekRange("2026-09-06")).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });
});

describe("previousEquivalentRange", () => {
  it("shifts a single day back by one day", () => {
    expect(previousEquivalentRange("2026-09-03", "2026-09-03")).toEqual({
      from: "2026-09-02",
      to: "2026-09-02",
    });
  });

  it("shifts a 7-day range back by 7 days", () => {
    expect(previousEquivalentRange("2026-08-31", "2026-09-06")).toEqual({
      from: "2026-08-24",
      to: "2026-08-30",
    });
  });

  it("compares a calendar month against the immediately preceding same-length span", () => {
    // September 2026 (30 days) -> the 30 days ending 31 Aug.
    expect(previousEquivalentRange("2026-09-01", "2026-09-30")).toEqual({
      from: "2026-08-02",
      to: "2026-08-31",
    });
  });

  it("crosses a year boundary", () => {
    expect(previousEquivalentRange("2026-01-01", "2026-01-05")).toEqual({
      from: "2025-12-27",
      to: "2025-12-31",
    });
  });
});

describe("detectPreset", () => {
  const today = "2026-09-03";

  it("detects today", () => {
    expect(detectPreset(today, today, today)).toBe("today");
  });

  it("detects this week", () => {
    const w = thisWeekRange(today);
    expect(detectPreset(w.from, w.to, today)).toBe("this_week");
  });

  it("detects this month", () => {
    const m = thisMonthRange(today);
    expect(detectPreset(m.from, m.to, today)).toBe("this_month");
  });

  it("detects last month", () => {
    expect(detectPreset("2026-08-01", lastDayOfMonthStr("2026", "08"), today)).toBe("last_month");
  });

  it("detects this year", () => {
    expect(detectPreset("2026-01-01", today, today)).toBe("this_year");
  });

  it("falls back to custom", () => {
    expect(detectPreset("2026-05-01", "2026-05-10", today)).toBe("custom");
  });
});
