import { describe, it, expect } from "vitest";
import { businessDateFor, previousBusinessDate } from "./businessDate";

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
