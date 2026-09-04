import { describe, it, expect } from "vitest";
import {
  filterStandaloneLedgerLines,
  groupStandaloneLedgerByDate,
  standaloneLedgerGrandTotalSen,
  classifyStandaloneChannel,
  standaloneChannelSummary,
  type StandaloneLedgerLine,
} from "./standaloneLedger";

function makeLine(overrides: Partial<StandaloneLedgerLine> = {}): StandaloneLedgerLine {
  return {
    id: "1",
    date: "2026-09-01",
    category: "OTA payout",
    note: "",
    counterparty: "",
    paymentMethod: "Cash",
    paymentMethodType: "cash",
    amountSen: 1000,
    enteredBy: "Someone",
    ...overrides,
  };
}

describe("filterStandaloneLedgerLines", () => {
  const lines = [
    makeLine({ category: "OTA payout", paymentMethod: "Cash", amountSen: 1000 }),
    makeLine({ category: "Corporate", paymentMethod: "Bank transfer", amountSen: 50000 }),
    makeLine({ category: "OTA payout", paymentMethod: "Bank transfer", amountSen: 30000 }),
  ];

  it("returns everything with no filters", () => {
    expect(filterStandaloneLedgerLines(lines, {})).toHaveLength(3);
  });

  it("filters by category", () => {
    expect(filterStandaloneLedgerLines(lines, { category: "OTA payout" })).toHaveLength(2);
  });

  it("filters by payment method", () => {
    expect(filterStandaloneLedgerLines(lines, { paymentMethod: "Bank transfer" })).toHaveLength(2);
  });

  it("filters by minimum amount, inclusive", () => {
    expect(filterStandaloneLedgerLines(lines, { minAmountSen: 30000 })).toHaveLength(2);
  });

  it("combines filters with AND", () => {
    const result = filterStandaloneLedgerLines(lines, { category: "OTA payout", minAmountSen: 5000 });
    expect(result).toHaveLength(1);
    expect(result[0].amountSen).toBe(30000);
  });
});

describe("groupStandaloneLedgerByDate", () => {
  const lines = [
    makeLine({ date: "2026-09-01", amountSen: 1000 }),
    makeLine({ date: "2026-09-01", amountSen: 500 }),
    makeLine({ date: "2026-09-02", amountSen: 2000 }),
  ];

  it("groups by date with a subtotal per day, newest first by default", () => {
    const groups = groupStandaloneLedgerByDate(lines);
    expect(groups.map((g) => g.date)).toEqual(["2026-09-02", "2026-09-01"]);
    expect(groups[1].lines).toHaveLength(2);
    expect(groups[1].subtotalSen).toBe(1500);
  });

  it("groups oldest first when asked", () => {
    const groups = groupStandaloneLedgerByDate(lines, "asc");
    expect(groups.map((g) => g.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("standaloneLedgerGrandTotalSen", () => {
  it("sums every line", () => {
    expect(standaloneLedgerGrandTotalSen([makeLine({ amountSen: 100 }), makeLine({ amountSen: 250 })])).toBe(350);
  });
  it("is zero for an empty list", () => {
    expect(standaloneLedgerGrandTotalSen([])).toBe(0);
  });
});

describe("classifyStandaloneChannel", () => {
  it("classifies cash by type", () => {
    expect(classifyStandaloneChannel("Cash", "cash")).toBe("Cash");
  });

  it("classifies DuitNow QR by name even though its type is ewallet", () => {
    expect(classifyStandaloneChannel("DuitNow QR", "ewallet")).toBe("DuitNow / QR");
  });

  it("classifies a generic e-wallet by type", () => {
    expect(classifyStandaloneChannel("Touch 'n Go", "ewallet")).toBe("E-wallet");
    expect(classifyStandaloneChannel("GrabPay", "ewallet")).toBe("E-wallet");
  });

  it("classifies card and bank transfer by type", () => {
    expect(classifyStandaloneChannel("Card terminal", "card")).toBe("Card");
    expect(classifyStandaloneChannel("Bank transfer", "bank_transfer")).toBe("Bank transfer");
  });

  it("falls back to Other for cheque or unknown types", () => {
    expect(classifyStandaloneChannel("Cheque", "cheque")).toBe("Other");
    expect(classifyStandaloneChannel("Something else", "other")).toBe("Other");
  });
});

describe("standaloneChannelSummary", () => {
  it("always returns the five primary channels, computing percentages of the total", () => {
    const lines = [
      makeLine({ paymentMethod: "Cash", paymentMethodType: "cash", amountSen: 300 }),
      makeLine({ paymentMethod: "DuitNow QR", paymentMethodType: "ewallet", amountSen: 700 }),
    ];
    const summary = standaloneChannelSummary(lines);
    const byChannel = Object.fromEntries(summary.map((s) => [s.channel, s]));
    expect(Object.keys(byChannel)).toEqual(["Cash", "DuitNow / QR", "Card", "E-wallet", "Bank transfer"]);
    expect(byChannel["Cash"].amountSen).toBe(300);
    expect(byChannel["Cash"].pct).toBe(30);
    expect(byChannel["DuitNow / QR"].pct).toBe(70);
    expect(byChannel["Card"].amountSen).toBe(0);
  });

  it("appends Other only when it is nonzero", () => {
    const noOther = standaloneChannelSummary([makeLine({ paymentMethodType: "cash" })]);
    expect(noOther.find((s) => s.channel === "Other")).toBeUndefined();

    const withOther = standaloneChannelSummary([
      makeLine({ paymentMethod: "Cheque", paymentMethodType: "cheque", amountSen: 500 }),
    ]);
    const other = withOther.find((s) => s.channel === "Other");
    expect(other?.amountSen).toBe(500);
    expect(other?.pct).toBe(100);
  });

  it("percentages are all zero for an empty list", () => {
    for (const s of standaloneChannelSummary([])) {
      expect(s.pct).toBe(0);
      expect(s.amountSen).toBe(0);
    }
  });
});
