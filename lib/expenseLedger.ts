/**
 * Pure functions for the /reports itemised expense list — manager+ only
 * (rule 7: reception never sees this; enforced by lib/reportData.ts never
 * building it for a reception-scoped request, not by hiding it in the UI).
 * NO database imports — the caller resolves category/payment-method/user
 * ids to display names before building a line, same split as everywhere
 * else in this module family (lib/dailyBreakdown.ts, lib/reportSummary.ts).
 */

import type { CAPITAL_OR_OPERATING } from "./expenses";

export type CapitalOrOperating = (typeof CAPITAL_OR_OPERATING)[number];

export interface ExpenseLedgerLine {
  date: string;
  category: string;
  note: string;
  paidTo: string;
  paymentMethod: string;
  amountSen: number;
  capitalOrOperating: CapitalOrOperating;
  source: "night" | "standalone";
  enteredBy: string;
}

// ---------------------------------------------------------------------------
// Building lines from raw data
// ---------------------------------------------------------------------------

const PAID_BY_LABEL: Record<"cash" | "card", string> = { cash: "Cash", card: "Card" };

/**
 * Night-report petty cash lines have no capital/operating field of their
 * own (CLAUDE.md: that distinction is expense-only, i.e. the standalone
 * `expenses` collection) — petty cash spending is always day-to-day
 * running cost, so every night-report line is "operating" here.
 */
export function buildNightExpenseLedgerLines(
  date: string,
  expenses: { category: string; amountSen: number; paidTo?: string; paidBy: "cash" | "card"; note?: string }[],
  enteredByName: string,
): ExpenseLedgerLine[] {
  return expenses.map((e) => ({
    date,
    category: e.category,
    note: e.note?.trim() ?? "",
    paidTo: e.paidTo?.trim() ?? "",
    paymentMethod: PAID_BY_LABEL[e.paidBy],
    amountSen: e.amountSen,
    capitalOrOperating: "operating",
    source: "night",
    enteredBy: enteredByName,
  }));
}

export interface StandaloneLedgerInput {
  date: string;
  categoryId: string;
  amountSen: number;
  paymentMethodId: string;
  paidTo?: string;
  note?: string;
  capitalOrOperating: CapitalOrOperating;
  paidBy: string; // user id of whoever recorded it
  linkedBusinessDayId: string | null;
}

/** Excludes entries already represented in a night report (the standing
 * double-counting rule, lib/reporting.ts's combinedTotalSen) — never
 * relevant today since nothing sets linkedBusinessDayId yet, but this is
 * the one other place that rule has to hold. */
export function buildStandaloneExpenseLedgerLines(
  entries: StandaloneLedgerInput[],
  categoryNameById: Map<string, string>,
  paymentMethodNameById: Map<string, string>,
  userNameById: Map<string, string>,
): ExpenseLedgerLine[] {
  return entries
    .filter((e) => e.linkedBusinessDayId === null)
    .map((e) => ({
      date: e.date,
      category: categoryNameById.get(e.categoryId) ?? e.categoryId,
      note: e.note?.trim() ?? "",
      paidTo: e.paidTo?.trim() ?? "",
      paymentMethod: paymentMethodNameById.get(e.paymentMethodId) ?? "Unknown",
      amountSen: e.amountSen,
      capitalOrOperating: e.capitalOrOperating,
      source: "standalone",
      enteredBy: userNameById.get(e.paidBy) ?? "Unknown",
    }));
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface ExpenseLedgerFilters {
  category?: string;
  paymentMethod?: string;
  capitalOrOperating?: CapitalOrOperating;
  /** Inclusive lower bound, in sen. */
  minAmountSen?: number;
}

/** All filters are optional and combinable (AND'd together) — the caller
 * (a client-side filter bar) omits whichever it isn't using. */
export function filterExpenseLedgerLines(
  lines: ExpenseLedgerLine[],
  filters: ExpenseLedgerFilters,
): ExpenseLedgerLine[] {
  return lines.filter((l) => {
    if (filters.category && l.category !== filters.category) return false;
    if (filters.paymentMethod && l.paymentMethod !== filters.paymentMethod) return false;
    if (filters.capitalOrOperating && l.capitalOrOperating !== filters.capitalOrOperating) {
      return false;
    }
    if (filters.minAmountSen !== undefined && l.amountSen < filters.minAmountSen) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type ExpenseLedgerSortKey = "date" | "category" | "amount";
export type SortDirection = "asc" | "desc";

/** A flat sort across the whole list — used when sorting by category or
 * amount, which necessarily interleaves rows from different dates and so
 * can't keep the day-grouping/subtotal shape (that only makes sense in
 * date order). Sorting by date itself never needs this: use
 * groupExpenseLedgerByDate instead, which already sorts the day groups. */
export function sortExpenseLedgerLines(
  lines: ExpenseLedgerLine[],
  key: ExpenseLedgerSortKey,
  direction: SortDirection,
): ExpenseLedgerLine[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...lines].sort((a, b) => {
    if (key === "category") return sign * a.category.localeCompare(b.category);
    if (key === "amount") return sign * (a.amountSen - b.amountSen);
    return sign * a.date.localeCompare(b.date);
  });
}

// ---------------------------------------------------------------------------
// Day grouping — the default view: "the day-by-day shape is visible
// without losing the detail."
// ---------------------------------------------------------------------------

export interface ExpenseLedgerDayGroup {
  date: string;
  lines: ExpenseLedgerLine[];
  subtotalSen: number;
}

export function groupExpenseLedgerByDate(
  lines: ExpenseLedgerLine[],
  direction: SortDirection = "desc",
): ExpenseLedgerDayGroup[] {
  const byDate = new Map<string, ExpenseLedgerLine[]>();
  for (const l of lines) {
    const bucket = byDate.get(l.date);
    if (bucket) bucket.push(l);
    else byDate.set(l.date, [l]);
  }
  const sign = direction === "asc" ? 1 : -1;
  const dates = Array.from(byDate.keys()).sort((a, b) => sign * a.localeCompare(b));
  return dates.map((date) => {
    const dayLines = byDate.get(date)!;
    return { date, lines: dayLines, subtotalSen: dayLines.reduce((s, l) => s + l.amountSen, 0) };
  });
}

export function ledgerGrandTotalSen(lines: ExpenseLedgerLine[]): number {
  return lines.reduce((s, l) => s + l.amountSen, 0);
}
