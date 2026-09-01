import { describe, it, expect } from "vitest";
import {
  businessDateFor,
  previousBusinessDate,
  businessDateMinusDays,
  lastBusinessDates,
  canSubmitDate,
  formatBusinessDateLabel,
} from "./businessDate";

/**
 * KL is UTC+8 with no daylight saving. To construct an instant at a given KL
 * wall-clock time, subtract 8 hours to get UTC.
 */
function klInstant(
  y: number,
  m: number,
  d: number,
  hour: number,
  min = 0,
): Date {
  return new Date(Date.UTC(y, m - 1, d, hour - 8, min));
}

describe("businessDateFor (default cutoff 06:00)", () => {
  it("assigns the same day at and after the cutoff", () => {
    expect(businessDateFor(klInstant(2026, 9, 2, 6, 0))).toBe("2026-09-02");
    expect(businessDateFor(klInstant(2026, 9, 2, 23, 0))).toBe("2026-09-02");
    expect(businessDateFor(klInstant(2026, 9, 2, 12, 30))).toBe("2026-09-02");
  });

  it("rolls a pre-cutoff instant back to the previous business day", () => {
    expect(businessDateFor(klInstant(2026, 9, 2, 1, 30))).toBe("2026-09-01");
    expect(businessDateFor(klInstant(2026, 9, 2, 0, 0))).toBe("2026-09-01");
    expect(businessDateFor(klInstant(2026, 9, 2, 5, 59))).toBe("2026-09-01");
  });

  it("handles month boundaries", () => {
    expect(businessDateFor(klInstant(2026, 10, 1, 2, 0))).toBe("2026-09-30");
  });

  it("handles year boundaries", () => {
    expect(businessDateFor(klInstant(2027, 1, 1, 3, 0))).toBe("2026-12-31");
  });

  it("handles the KL/UTC date line: 22:00 UTC is already tomorrow in KL", () => {
    // 2026-09-01 22:00 UTC = 2026-09-02 06:00 KL -> business day 2026-09-02
    expect(businessDateFor(new Date(Date.UTC(2026, 8, 1, 22, 0)))).toBe(
      "2026-09-02",
    );
  });
});

describe("businessDateFor (custom cutoff)", () => {
  it("cutoff 0 always uses the KL calendar day", () => {
    expect(businessDateFor(klInstant(2026, 9, 2, 0, 0), 0)).toBe("2026-09-02");
    expect(businessDateFor(klInstant(2026, 9, 2, 5, 59), 0)).toBe("2026-09-02");
  });

  it("respects a later cutoff", () => {
    expect(businessDateFor(klInstant(2026, 9, 2, 7, 0), 8)).toBe("2026-09-01");
    expect(businessDateFor(klInstant(2026, 9, 2, 8, 0), 8)).toBe("2026-09-02");
  });
});

describe("businessDateFor validation", () => {
  it("rejects an invalid date", () => {
    expect(() => businessDateFor(new Date("nope"))).toThrow();
  });

  it("rejects an out-of-range cutoff", () => {
    expect(() => businessDateFor(new Date(), -1)).toThrow();
    expect(() => businessDateFor(new Date(), 24)).toThrow();
    expect(() => businessDateFor(new Date(), 6.5)).toThrow();
  });
});

describe("previousBusinessDate", () => {
  it("steps back one day", () => {
    expect(previousBusinessDate("2026-09-02")).toBe("2026-09-01");
  });

  it("handles month boundaries", () => {
    expect(previousBusinessDate("2026-10-01")).toBe("2026-09-30");
    expect(previousBusinessDate("2026-03-01")).toBe("2026-02-28"); // not a leap year
  });

  it("handles year boundaries", () => {
    expect(previousBusinessDate("2027-01-01")).toBe("2026-12-31");
  });

  it("rejects a malformed date", () => {
    expect(() => previousBusinessDate("nope")).toThrow();
  });
});

describe("businessDateMinusDays", () => {
  it("steps back n days", () => {
    expect(businessDateMinusDays("2026-09-07", 6)).toBe("2026-09-01");
  });

  it("n=0 returns the date unchanged", () => {
    expect(businessDateMinusDays("2026-09-07", 0)).toBe("2026-09-07");
  });

  it("handles month and year boundaries", () => {
    expect(businessDateMinusDays("2026-09-03", 5)).toBe("2026-08-29");
    expect(businessDateMinusDays("2026-01-02", 5)).toBe("2025-12-28");
  });

  it("agrees with previousBusinessDate at n=1", () => {
    expect(businessDateMinusDays("2026-09-07", 1)).toBe(
      previousBusinessDate("2026-09-07"),
    );
  });
});

describe("lastBusinessDates", () => {
  it("returns the last N dates ending at current, oldest first", () => {
    expect(lastBusinessDates("2026-09-07", 3)).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);
  });

  it("the 7-day reception window is today plus the 6 days before it", () => {
    const dates = lastBusinessDates("2026-09-07", 7);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates.at(-1)).toBe("2026-09-07");
    expect(dates).toHaveLength(7);
  });
});

describe("canSubmitDate", () => {
  const CURRENT = "2026-09-07";

  it("nobody may submit a future date", () => {
    expect(canSubmitDate("2026-09-08", CURRENT, "reception")).toBe(false);
    expect(canSubmitDate("2026-09-08", CURRENT, "owner")).toBe(false);
  });

  it("reception may submit today or any of the 6 days before it", () => {
    expect(canSubmitDate(CURRENT, CURRENT, "reception")).toBe(true);
    expect(canSubmitDate("2026-09-01", CURRENT, "reception")).toBe(true); // 6 days back
  });

  it("reception may not submit older than 7 days total", () => {
    expect(canSubmitDate("2026-08-31", CURRENT, "reception")).toBe(false); // 7 days back
  });

  it("owner may submit any past date, no lower limit", () => {
    expect(canSubmitDate("2026-08-31", CURRENT, "owner")).toBe(true);
    expect(canSubmitDate("2020-01-01", CURRENT, "owner")).toBe(true);
  });

  it("a custom backfillDays window is respected", () => {
    // backfillDays=3 means 3 selectable dates total: 09-07, 09-06, 09-05.
    expect(canSubmitDate("2026-09-05", CURRENT, "reception", 3)).toBe(true);
    expect(canSubmitDate("2026-09-04", CURRENT, "reception", 3)).toBe(false);
  });
});

describe("formatBusinessDateLabel", () => {
  it("formats as weekday, day, short month", () => {
    // 2026-09-03 is a Thursday.
    expect(formatBusinessDateLabel("2026-09-03")).toBe("Thu 3 Sep");
  });

  it("always uses a 3-letter month, not ICU's locale-dependent 'Sept'", () => {
    expect(formatBusinessDateLabel("2026-09-01")).toContain(" Sep");
    expect(formatBusinessDateLabel("2026-09-01")).not.toContain("Sept");
  });

  it("handles a year boundary", () => {
    expect(formatBusinessDateLabel("2026-01-01")).toBe("Thu 1 Jan");
  });

  it("rejects a malformed date", () => {
    expect(() => formatBusinessDateLabel("nope")).toThrow();
  });
});
