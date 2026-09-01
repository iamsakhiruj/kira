import { describe, it, expect } from "vitest";
import { toSen, fromSen, formatRM, MoneyError } from "./money";

describe("toSen", () => {
  it("parses whole ringgit", () => {
    expect(toSen("1234")).toBe(123400);
    expect(toSen("0")).toBe(0);
  });

  it("parses one and two decimal places", () => {
    expect(toSen("1234.5")).toBe(123450);
    expect(toSen("1234.50")).toBe(123450);
    expect(toSen("1.05")).toBe(105);
    expect(toSen("0.99")).toBe(99);
  });

  it("parses thousands separators", () => {
    expect(toSen("1,234.50")).toBe(123450);
    expect(toSen("1,234")).toBe(123400);
    expect(toSen("12,345,678.90")).toBe(1234567890);
  });

  it("accepts an optional RM prefix and surrounding space", () => {
    expect(toSen("RM 1,234.50")).toBe(123450);
    expect(toSen("  rm1234  ")).toBe(123400);
  });

  it("handles negatives (refunds, variance, drawings out)", () => {
    expect(toSen("-1234.50")).toBe(-123450);
    expect(toSen("-RM 20")).toBe(-2000);
  });

  it("accepts numbers with at most 2 decimal places", () => {
    expect(toSen(1234.5)).toBe(123450);
    expect(toSen(19.99)).toBe(1999);
    expect(toSen(0)).toBe(0);
  });

  // The rule: refuse to guess.
  it('throws on ambiguous "1.234" rather than guessing', () => {
    expect(() => toSen("1.234")).toThrow(MoneyError);
    expect(() => toSen("12.345")).toThrow(MoneyError);
  });

  it("throws on more than 2 decimal places", () => {
    expect(() => toSen("1234.567")).toThrow(MoneyError);
    expect(() => toSen(1.234)).toThrow(MoneyError);
  });

  it("throws on ambiguous comma-only grouping", () => {
    expect(() => toSen("1,50")).toThrow(MoneyError);
    expect(() => toSen("1,2345")).toThrow(MoneyError);
  });

  it("throws on junk and empty input", () => {
    expect(() => toSen("")).toThrow(MoneyError);
    expect(() => toSen("   ")).toThrow(MoneyError);
    expect(() => toSen("abc")).toThrow(MoneyError);
    expect(() => toSen("1.2.3")).toThrow(MoneyError);
    expect(() => toSen("1234.")).toThrow(MoneyError);
    expect(() => toSen("RM")).toThrow(MoneyError);
    expect(() => toSen(Infinity)).toThrow(MoneyError);
    expect(() => toSen(NaN)).toThrow(MoneyError);
  });
});

describe("fromSen", () => {
  it("formats with grouping and two decimals", () => {
    expect(fromSen(123450)).toBe("1,234.50");
    expect(fromSen(1234567890)).toBe("12,345,678.90");
    expect(fromSen(5)).toBe("0.05");
    expect(fromSen(0)).toBe("0.00");
    expect(fromSen(100)).toBe("1.00");
  });

  it("formats negatives with a leading minus", () => {
    expect(fromSen(-123450)).toBe("-1,234.50");
    expect(fromSen(-5)).toBe("-0.05");
  });

  it("throws on non-integer sen", () => {
    expect(() => fromSen(12.5)).toThrow(MoneyError);
  });
});

describe("formatRM", () => {
  it("adds the currency symbol", () => {
    expect(formatRM(123450)).toBe("RM 1,234.50");
    expect(formatRM(0)).toBe("RM 0.00");
  });

  it("keeps the minus in front of the symbol", () => {
    expect(formatRM(-2000)).toBe("-RM 20.00");
  });
});

describe("round trip", () => {
  it("toSen then fromSen is stable", () => {
    for (const s of ["0.00", "0.05", "1.00", "1,234.50", "999,999.99"]) {
      expect(fromSen(toSen(s))).toBe(s);
    }
  });
});
