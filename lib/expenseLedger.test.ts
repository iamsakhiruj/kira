import { describe, it, expect } from "vitest";
import {
  buildNightExpenseLedgerLines,
  buildStandaloneExpenseLedgerLines,
  filterExpenseLedgerLines,
  sortExpenseLedgerLines,
  groupExpenseLedgerByDate,
  ledgerGrandTotalSen,
  type ExpenseLedgerLine,
} from "./expenseLedger";

describe("buildNightExpenseLedgerLines", () => {
  it("maps night-report lines, defaulting to operating and the report's submitter", () => {
    const lines = buildNightExpenseLedgerLines(
      "2026-09-03",
      [{ category: "Transport", amountSen: 2000, paidTo: "Grab", paidBy: "cash", note: "Airport run" }],
      "Anis Haider",
    );
    expect(lines).toEqual([
      {
        date: "2026-09-03",
        category: "Transport",
        note: "Airport run",
        paidTo: "Grab",
        paymentMethod: "Cash",
        amountSen: 2000,
        capitalOrOperating: "operating",
        source: "night",
        enteredBy: "Anis Haider",
      },
    ]);
  });

  it("defaults note/paidTo to empty strings when absent", () => {
    const lines = buildNightExpenseLedgerLines(
      "2026-09-03",
      [{ category: "Misc", amountSen: 100, paidBy: "card" }],
      "Anis Haider",
    );
    expect(lines[0].note).toBe("");
    expect(lines[0].paidTo).toBe("");
    expect(lines[0].paymentMethod).toBe("Card");
  });
});

describe("buildStandaloneExpenseLedgerLines", () => {
  const categoryNameById = new Map([["c1", "Utilities"]]);
  const paymentMethodNameById = new Map([["pm1", "DuitNow QR"]]);
  const userNameById = new Map([["u1", "Salim"]]);

  it("resolves category, payment method and recorder names", () => {
    const lines = buildStandaloneExpenseLedgerLines(
      [
        {
          date: "2026-09-02",
          categoryId: "c1",
          amountSen: 5000,
          paymentMethodId: "pm1",
          paidTo: "TNB",
          note: "Electricity bill",
          capitalOrOperating: "operating",
          paidBy: "u1",
          linkedBusinessDayId: null,
        },
      ],
      categoryNameById,
      paymentMethodNameById,
      userNameById,
    );
    expect(lines).toEqual([
      {
        date: "2026-09-02",
        category: "Utilities",
        note: "Electricity bill",
        paidTo: "TNB",
        paymentMethod: "DuitNow QR",
        amountSen: 5000,
        capitalOrOperating: "operating",
        source: "standalone",
        enteredBy: "Salim",
      },
    ]);
  });

  it("excludes entries already linked to a business day (double-counting rule)", () => {
    const lines = buildStandaloneExpenseLedgerLines(
      [
        {
          date: "2026-09-02",
          categoryId: "c1",
          amountSen: 5000,
          paymentMethodId: "pm1",
          capitalOrOperating: "operating",
          paidBy: "u1",
          linkedBusinessDayId: "day1",
        },
      ],
      categoryNameById,
      paymentMethodNameById,
      userNameById,
    );
    expect(lines).toHaveLength(0);
  });

  it("falls back to raw ids / Unknown when a lookup misses", () => {
    const lines = buildStandaloneExpenseLedgerLines(
      [
        {
          date: "2026-09-02",
          categoryId: "gone",
          amountSen: 100,
          paymentMethodId: "gone",
          capitalOrOperating: "capital",
          paidBy: "gone",
          linkedBusinessDayId: null,
        },
      ],
      new Map(),
      new Map(),
      new Map(),
    );
    expect(lines[0].category).toBe("gone");
    expect(lines[0].paymentMethod).toBe("Unknown");
    expect(lines[0].enteredBy).toBe("Unknown");
  });
});

// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<ExpenseLedgerLine> = {}): ExpenseLedgerLine {
  return {
    date: "2026-09-01",
    category: "Transport",
    note: "",
    paidTo: "",
    paymentMethod: "Cash",
    amountSen: 1000,
    capitalOrOperating: "operating",
    source: "night",
    enteredBy: "Someone",
    ...overrides,
  };
}

describe("filterExpenseLedgerLines", () => {
  const lines = [
    makeLine({ category: "Transport", paymentMethod: "Cash", capitalOrOperating: "operating", amountSen: 1000 }),
    makeLine({ category: "Utilities", paymentMethod: "DuitNow QR", capitalOrOperating: "capital", amountSen: 50000 }),
    makeLine({ category: "Transport", paymentMethod: "Card", capitalOrOperating: "operating", amountSen: 30000 }),
  ];

  it("returns everything when no filter is set", () => {
    expect(filterExpenseLedgerLines(lines, {})).toHaveLength(3);
  });

  it("filters by category", () => {
    expect(filterExpenseLedgerLines(lines, { category: "Transport" })).toHaveLength(2);
  });

  it("filters by payment method", () => {
    expect(filterExpenseLedgerLines(lines, { paymentMethod: "Card" })).toHaveLength(1);
  });

  it("filters by capital or operating", () => {
    expect(filterExpenseLedgerLines(lines, { capitalOrOperating: "capital" })).toHaveLength(1);
  });

  it("filters by minimum amount, inclusive", () => {
    expect(filterExpenseLedgerLines(lines, { minAmountSen: 30000 })).toHaveLength(2);
  });

  it("combines filters with AND", () => {
    const result = filterExpenseLedgerLines(lines, { category: "Transport", minAmountSen: 5000 });
    expect(result).toHaveLength(1);
    expect(result[0].amountSen).toBe(30000);
  });
});

describe("sortExpenseLedgerLines", () => {
  const lines = [
    makeLine({ date: "2026-09-02", category: "B", amountSen: 500 }),
    makeLine({ date: "2026-09-01", category: "A", amountSen: 2000 }),
    makeLine({ date: "2026-09-03", category: "C", amountSen: 100 }),
  ];

  it("sorts by date ascending or descending", () => {
    expect(sortExpenseLedgerLines(lines, "date", "asc").map((l) => l.date)).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03",
    ]);
    expect(sortExpenseLedgerLines(lines, "date", "desc").map((l) => l.date)).toEqual([
      "2026-09-03", "2026-09-02", "2026-09-01",
    ]);
  });

  it("sorts by category", () => {
    expect(sortExpenseLedgerLines(lines, "category", "asc").map((l) => l.category)).toEqual([
      "A", "B", "C",
    ]);
  });

  it("sorts by amount, largest first when descending", () => {
    expect(sortExpenseLedgerLines(lines, "amount", "desc").map((l) => l.amountSen)).toEqual([
      2000, 500, 100,
    ]);
  });

  it("does not mutate the input array", () => {
    const copy = [...lines];
    sortExpenseLedgerLines(lines, "amount", "asc");
    expect(lines).toEqual(copy);
  });
});

describe("groupExpenseLedgerByDate", () => {
  const lines = [
    makeLine({ date: "2026-09-01", amountSen: 1000 }),
    makeLine({ date: "2026-09-01", amountSen: 500 }),
    makeLine({ date: "2026-09-02", amountSen: 2000 }),
  ];

  it("groups by date with a subtotal per day, newest first by default", () => {
    const groups = groupExpenseLedgerByDate(lines);
    expect(groups.map((g) => g.date)).toEqual(["2026-09-02", "2026-09-01"]);
    expect(groups[1].lines).toHaveLength(2);
    expect(groups[1].subtotalSen).toBe(1500);
    expect(groups[0].subtotalSen).toBe(2000);
  });

  it("groups oldest first when asked", () => {
    const groups = groupExpenseLedgerByDate(lines, "asc");
    expect(groups.map((g) => g.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("ledgerGrandTotalSen", () => {
  it("sums every line", () => {
    expect(ledgerGrandTotalSen([makeLine({ amountSen: 100 }), makeLine({ amountSen: 250 })])).toBe(350);
  });

  it("is zero for an empty list", () => {
    expect(ledgerGrandTotalSen([])).toBe(0);
  });
});
