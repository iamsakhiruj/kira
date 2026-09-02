import { describe, it, expect } from "vitest";
import {
  summarizeAccountPeriod,
  currentBalanceSen,
  resolveAccountIdByType,
  buildAccountMovements,
  type AccountMovement,
  type NightReportMovementInput,
} from "./accounts";

const cash = { id: "cash1", openingBalanceSen: 100000, openingDate: "2026-08-01" };

describe("summarizeAccountPeriod", () => {
  it("sums basic in/out within the period", () => {
    const movements: AccountMovement[] = [
      { accountId: "cash1", amountSen: 5000, date: "2026-09-05", source: "in" },
      { accountId: "cash1", amountSen: -2000, date: "2026-09-10", source: "out" },
    ];
    const s = summarizeAccountPeriod(cash, movements, "2026-09-01", "2026-09-30");
    expect(s.openingSen).toBe(100000);
    expect(s.moneyInSen).toBe(5000);
    expect(s.moneyOutSen).toBe(2000);
    expect(s.closingSen).toBe(103000);
  });

  it("carries the opening balance forward across several movements before the period", () => {
    const movements: AccountMovement[] = [
      { accountId: "cash1", amountSen: 5000, date: "2026-08-15", source: "before1" },
      { accountId: "cash1", amountSen: -1000, date: "2026-08-20", source: "before2" },
      { accountId: "cash1", amountSen: 2000, date: "2026-09-05", source: "in-period" },
    ];
    const s = summarizeAccountPeriod(cash, movements, "2026-09-01", "2026-09-30");
    expect(s.openingSen).toBe(104000); // 100000 + 5000 - 1000
    expect(s.moneyInSen).toBe(2000);
    expect(s.moneyOutSen).toBe(0);
    expect(s.closingSen).toBe(106000);
  });

  it("returns just the opening balance for a period entirely before the account existed", () => {
    const lateAccount = { id: "cash1", openingBalanceSen: 0, openingDate: "2026-09-10" };
    const movements: AccountMovement[] = [
      { accountId: "cash1", amountSen: 9999, date: "2026-09-15", source: "after opening, out of range" },
    ];
    const s = summarizeAccountPeriod(lateAccount, movements, "2026-09-01", "2026-09-05");
    expect(s.openingSen).toBe(0);
    expect(s.moneyInSen).toBe(0);
    expect(s.moneyOutSen).toBe(0);
    expect(s.closingSen).toBe(0);
  });

  it("clips the in-period window to the account's own opening date when it falls inside the period", () => {
    const midAccount = { id: "cash1", openingBalanceSen: 5000, openingDate: "2026-09-10" };
    const movements: AccountMovement[] = [
      { accountId: "cash1", amountSen: 1000, date: "2026-09-15", source: "in" },
    ];
    const s = summarizeAccountPeriod(midAccount, movements, "2026-09-01", "2026-09-30");
    expect(s.openingSen).toBe(5000);
    expect(s.moneyInSen).toBe(1000);
    expect(s.closingSen).toBe(6000);
  });

  it("handles a period with zero movements", () => {
    const s = summarizeAccountPeriod(cash, [], "2026-09-01", "2026-09-30");
    expect(s).toEqual({
      accountId: "cash1",
      openingSen: 100000,
      moneyInSen: 0,
      moneyOutSen: 0,
      closingSen: 100000,
    });
  });

  it("ignores movements belonging to a different account", () => {
    const movements: AccountMovement[] = [
      { accountId: "other", amountSen: 99999, date: "2026-09-05", source: "not mine" },
    ];
    const s = summarizeAccountPeriod(cash, movements, "2026-09-01", "2026-09-30");
    expect(s.closingSen).toBe(100000);
  });
});

describe("currentBalanceSen", () => {
  it("is the closing balance of the period from openingDate through asOfDate", () => {
    const movements: AccountMovement[] = [
      { accountId: "cash1", amountSen: 2000, date: "2026-08-10", source: "in" },
      { accountId: "cash1", amountSen: -500, date: "2026-09-01", source: "out" },
    ];
    expect(currentBalanceSen(cash, movements, "2026-09-15")).toBe(101500);
  });
});

describe("resolveAccountIdByType", () => {
  const accounts = [
    { id: "a", type: "bank" as const, active: true, displayOrder: 2 },
    { id: "b", type: "bank" as const, active: true, displayOrder: 1 },
    { id: "c", type: "bank" as const, active: false, displayOrder: 0 },
    { id: "d", type: "cash" as const, active: true, displayOrder: 0 },
  ];

  it("picks the first active account of the type by displayOrder", () => {
    expect(resolveAccountIdByType(accounts, "bank")).toBe("b");
  });

  it("skips inactive accounts even with a lower displayOrder", () => {
    expect(resolveAccountIdByType(accounts, "bank")).not.toBe("c");
  });

  it("returns null when no active account of that type exists", () => {
    expect(resolveAccountIdByType(accounts, "ewallet")).toBeNull();
  });
});

describe("buildAccountMovements", () => {
  const accounts = [
    { id: "cash1", type: "cash" as const, active: true, displayOrder: 0 },
    { id: "bank1", type: "bank" as const, active: true, displayOrder: 1 },
  ];
  const accountIdByPaymentMethod = new Map<string, string | null>([
    ["pm-cash", "cash1"],
    ["pm-bank", "bank1"],
    ["pm-unlinked", null],
  ]);

  function baseNightReport(overrides: Partial<NightReportMovementInput> = {}) {
    return {
      date: "2026-09-05",
      collections: { cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0, refundsSen: 0 },
      cash: { bankedInSen: 0 },
      expenses: [],
      ...overrides,
    };
  }

  it("routes night-report collections to the account of the matching type", () => {
    const { movements, unattributedSen } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [
        baseNightReport({
          collections: { cashSen: 10000, cardSen: 2000, transferSen: 3000, ewalletSen: 500, refundsSen: 0 },
        }),
      ],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    // No ewallet-type account exists in this fixture, so the 500 e-wallet
    // collection is unattributed rather than silently dropped.
    expect(unattributedSen).toBe(500);
    const cashIn = movements.filter((m) => m.accountId === "cash1");
    const bankIn = movements.filter((m) => m.accountId === "bank1");
    expect(cashIn.reduce((s, m) => s + m.amountSen, 0)).toBe(10000);
    // card + transfer both land in the one bank account.
    expect(bankIn.reduce((s, m) => s + m.amountSen, 0)).toBe(5000);
  });

  it("treats ewallet collections as unattributed when no ewallet account exists", () => {
    const { unattributedSen } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [baseNightReport({ collections: { cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 777, refundsSen: 0 } })],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(unattributedSen).toBe(777);
  });

  it("treats refunds as leaving the cash account regardless of channel", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [baseNightReport({ collections: { cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0, refundsSen: 1500 } })],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(movements).toEqual([
      { accountId: "cash1", amountSen: -1500, date: "2026-09-05", source: "Night report — refund paid" },
    ]);
  });

  it("splits banked-in cash into a paired cash-out / bank-in movement from one field", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [baseNightReport({ cash: { bankedInSen: 20000 } })],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(movements).toEqual([
      { accountId: "cash1", amountSen: -20000, date: "2026-09-05", source: "Night report — banked in (from drawer)" },
      { accountId: "bank1", amountSen: 20000, date: "2026-09-05", source: "Night report — banked in (to bank)" },
    ]);
  });

  it("folds cash variance into the cash account, signed", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [baseNightReport({ varianceSen: -300 })],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(movements).toEqual([
      { accountId: "cash1", amountSen: -300, date: "2026-09-05", source: "Night report — cash variance" },
    ]);
  });

  it("routes night-report expenses by paidBy: cash vs card", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [
        baseNightReport({
          expenses: [
            { amountSen: 4000, paidBy: "cash" },
            { amountSen: 6000, paidBy: "card" },
          ],
        }),
      ],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(movements).toContainEqual({ accountId: "cash1", amountSen: -4000, date: "2026-09-05", source: "Night report — expense (cash)" });
    expect(movements).toContainEqual({ accountId: "bank1", amountSen: -6000, date: "2026-09-05", source: "Night report — expense (card)" });
  });

  it("resolves explicit sources via paymentMethodId -> accountId", () => {
    const { movements, unattributedSen } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [],
      expenses: [{ date: "2026-09-02", amountSen: 500, paymentMethodId: "pm-cash", label: "Expense — Cleaning" }],
      revenueEntries: [{ date: "2026-09-03", amountSen: 800, paymentMethodId: "pm-bank", label: "Revenue — Corporate" }],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(movements).toContainEqual({ accountId: "cash1", amountSen: -500, date: "2026-09-02", source: "Expense — Cleaning" });
    expect(movements).toContainEqual({ accountId: "bank1", amountSen: 800, date: "2026-09-03", source: "Revenue — Corporate" });
    expect(unattributedSen).toBe(0);
  });

  it("marks an unlinked payment method's money as unattributed, not silently dropped", () => {
    const { movements, unattributedSen } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [],
      expenses: [{ date: "2026-09-02", amountSen: 500, paymentMethodId: "pm-unlinked", label: "Expense — Misc" }],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(movements).toEqual([]);
    expect(unattributedSen).toBe(500);
  });

  it("marks a null paymentMethodId as unattributed (e.g. an old salary line)", () => {
    const { unattributedSen } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [{ date: "2026-09-02", amountSen: 250000, paymentMethodId: null, label: "Salary — Ali (2026-09)" }],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    expect(unattributedSen).toBe(250000);
  });

  it("lets a negative netSen salary line show as money in rather than clamping", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [{ date: "2026-09-02", amountSen: -1000, paymentMethodId: "pm-cash", label: "Salary — Ali (2026-09)" }],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [],
    });
    // salaryPaymentsPaid is money out (-amountSen), so a negative amountSen
    // (over-deducted) flips to a positive movement — money in.
    expect(movements).toEqual([
      { accountId: "cash1", amountSen: 1000, date: "2026-09-02", source: "Salary — Ali (2026-09)" },
    ]);
  });

  it("treats partner drawings as out and injections as in", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [{ date: "2026-09-02", amountSen: 5000, paymentMethodId: "pm-bank", label: "Partner drawing — Aisha" }],
      partnerInjections: [{ date: "2026-09-02", amountSen: 8000, paymentMethodId: "pm-bank", label: "Partner injection — Aisha" }],
      otaRemittances: [],
    });
    expect(movements).toContainEqual({ accountId: "bank1", amountSen: -5000, date: "2026-09-02", source: "Partner drawing — Aisha" });
    expect(movements).toContainEqual({ accountId: "bank1", amountSen: 8000, date: "2026-09-02", source: "Partner injection — Aisha" });
  });

  it("treats OTA remittances as money in", () => {
    const { movements } = buildAccountMovements({
      accounts,
      accountIdByPaymentMethod,
      nightReports: [],
      expenses: [],
      revenueEntries: [],
      salaryPaymentsPaid: [],
      partnerDrawings: [],
      partnerInjections: [],
      otaRemittances: [{ date: "2026-09-02", amountSen: 30000, paymentMethodId: "pm-bank", label: "OTA remittance — Agoda" }],
    });
    expect(movements).toEqual([
      { accountId: "bank1", amountSen: 30000, date: "2026-09-02", source: "OTA remittance — Agoda" },
    ]);
  });
});
