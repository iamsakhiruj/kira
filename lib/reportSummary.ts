/**
 * Pure aggregation functions for the reports screen (Phase 2 §2.8).
 * NO database imports — takes already-fetched plain objects. Testable without
 * a real DB or Next.js runtime. All revenue/expense totals go through
 * `combinedTotalSen` from `./reporting` — never a second summing path.
 */

import { combinedTotalSen } from "./reporting";
import { isLateSubmission } from "./businessDate";
import {
  totalRevenueSen,
  occupancyRatio as calcOccupancyRatio,
  adrSen as calcAdrSen,
  revparSen as calcRevparSen,
} from "./nightReport";

// ---------------------------------------------------------------------------
// Input shapes (plain objects extracted from DB docs)
// ---------------------------------------------------------------------------

export interface NightDayDoc {
  rooms: {
    available: number;
    sold: number;
    houseUse: number;
    revenueSen: number;
  };
  revenueLines: { category: string; amountSen: number }[];
  expenses: { category: string; amountSen: number; paidBy: "cash" | "card" }[];
  collections: {
    cashSen: number;
    cardSen: number;
    transferSen: number;
    ewalletSen: number;
    otaPrepaidSen: number;
    chargeToAccountSen: number;
    depositsSen: number;
    refundsSen: number;
    receivablesSettledSen: number;
  };
  cash: {
    openingFloatSen: number;
    bankedInSen: number;
    countedSen: number;
    varianceSen?: number;
  };
  varianceSen?: number;
  varianceReason?: string;
  date?: string;
}

export interface StandaloneEntry {
  amountSen: number;
  linkedBusinessDayId: string | null;
  categoryId: string;
  paymentMethodId: string;
}

export interface PartnerTxn {
  direction: "drawing" | "injection";
  amountSen: number;
}

// ---------------------------------------------------------------------------
// Revenue by source
// ---------------------------------------------------------------------------

export function revenueBySource(
  nightDays: NightDayDoc[],
  standaloneRevenue: StandaloneEntry[],
  categoryNameById: Map<string, string>,
): { sources: { name: string; amountSen: number }[]; totalSen: number } {
  // Per-day night totals for combinedTotalSen
  const nightRevenuePerDay = nightDays.map((d) =>
    totalRevenueSen(d.rooms.revenueSen, d.revenueLines),
  );
  const totalSen = combinedTotalSen(nightRevenuePerDay, standaloneRevenue);

  // Break down by source — accumulate into a map
  const map = new Map<string, number>();

  for (const d of nightDays) {
    if (d.rooms.revenueSen > 0) {
      map.set("Rooms", (map.get("Rooms") ?? 0) + d.rooms.revenueSen);
    }
    for (const line of d.revenueLines) {
      if (line.amountSen > 0) {
        map.set(line.category, (map.get(line.category) ?? 0) + line.amountSen);
      }
    }
  }

  for (const entry of standaloneRevenue) {
    if (entry.linkedBusinessDayId !== null) continue;
    if (entry.amountSen <= 0) continue;
    const name = categoryNameById.get(entry.categoryId) ?? entry.categoryId;
    map.set(name, (map.get(name) ?? 0) + entry.amountSen);
  }

  const sources = Array.from(map.entries())
    .map(([name, amountSen]) => ({ name, amountSen }))
    .filter((s) => s.amountSen > 0)
    .sort((a, b) => b.amountSen - a.amountSen);

  return { sources, totalSen };
}

// ---------------------------------------------------------------------------
// Expenses by category
// ---------------------------------------------------------------------------

export function expensesByCategory(
  nightDays: NightDayDoc[],
  standaloneExpenses: StandaloneEntry[],
  categoryNameById: Map<string, string>,
): { categories: { name: string; amountSen: number }[]; totalSen: number } {
  const nightExpensePerDay = nightDays.map((d) =>
    d.expenses.reduce((s, e) => s + e.amountSen, 0),
  );
  const totalSen = combinedTotalSen(nightExpensePerDay, standaloneExpenses);

  const map = new Map<string, number>();

  for (const d of nightDays) {
    for (const line of d.expenses) {
      if (line.amountSen > 0) {
        map.set(line.category, (map.get(line.category) ?? 0) + line.amountSen);
      }
    }
  }

  for (const entry of standaloneExpenses) {
    if (entry.linkedBusinessDayId !== null) continue;
    if (entry.amountSen <= 0) continue;
    const name = categoryNameById.get(entry.categoryId) ?? entry.categoryId;
    map.set(name, (map.get(name) ?? 0) + entry.amountSen);
  }

  const categories = Array.from(map.entries())
    .map(([name, amountSen]) => ({ name, amountSen }))
    .filter((c) => c.amountSen > 0)
    .sort((a, b) => b.amountSen - a.amountSen);

  return { categories, totalSen };
}

// ---------------------------------------------------------------------------
// Net profit
// ---------------------------------------------------------------------------

export function netProfitSen(revenueTotal: number, expenseTotal: number): number {
  return revenueTotal - expenseTotal;
}

// ---------------------------------------------------------------------------
// Cash movement statement
// ---------------------------------------------------------------------------

export interface CashMovementResult {
  openingSen: number;
  collectionsSen: number;
  cashExpensesSen: number;
  drawingsSen: number;
  injectionsSen: number;
  closingSen: number;
}

export function cashMovement(input: {
  openingFloatSen: number;
  nightDays: NightDayDoc[];
  drawings: PartnerTxn[];
  injections: PartnerTxn[];
}): CashMovementResult {
  const openingSen = input.openingFloatSen;
  const collectionsSen = input.nightDays.reduce(
    (s, d) => s + d.collections.cashSen,
    0,
  );
  const cashExpensesSen = input.nightDays.reduce(
    (s, d) =>
      s + d.expenses.filter((e) => e.paidBy === "cash").reduce((es, e) => es + e.amountSen, 0),
    0,
  );
  const drawingsSen = input.drawings.reduce((s, t) => s + t.amountSen, 0);
  const injectionsSen = input.injections.reduce((s, t) => s + t.amountSen, 0);
  const closingSen = openingSen + collectionsSen - cashExpensesSen - drawingsSen + injectionsSen;
  return { openingSen, collectionsSen, cashExpensesSen, drawingsSen, injectionsSen, closingSen };
}

// ---------------------------------------------------------------------------
// Collections by channel
// ---------------------------------------------------------------------------

const TYPE_TO_CHANNEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  ewallet: "E-wallet",
  cheque: "Cheque",
  other: "Other",
};

export function collectionsByChannel(
  nightDays: NightDayDoc[],
  standaloneRevenue: StandaloneEntry[],
  paymentMethodTypeById: Map<string, string>,
): { channel: string; amountSen: number }[] {
  const map = new Map<string, number>();

  function add(channel: string, amount: number) {
    if (amount > 0) map.set(channel, (map.get(channel) ?? 0) + amount);
  }

  for (const d of nightDays) {
    const c = d.collections;
    add("Cash", c.cashSen);
    add("Card", c.cardSen);
    add("Bank transfer", c.transferSen);
    add("E-wallet", c.ewalletSen);
    add("OTA prepaid", c.otaPrepaidSen);
    add("Charge to account", c.chargeToAccountSen);
  }

  for (const entry of standaloneRevenue) {
    if (entry.linkedBusinessDayId !== null) continue;
    if (entry.amountSen <= 0) continue;
    const type = paymentMethodTypeById.get(entry.paymentMethodId);
    const channel = type ? (TYPE_TO_CHANNEL[type] ?? "Other") : "Other";
    add(channel, entry.amountSen);
  }

  return Array.from(map.entries())
    .map(([channel, amountSen]) => ({ channel, amountSen }))
    .filter((c) => c.amountSen > 0)
    .sort((a, b) => b.amountSen - a.amountSen);
}

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

export interface OccupancyResult {
  soldTotal: number;
  availableTotal: number;
  roomRevenueSen: number;
  occupancyRatio: number;
  adrSen: number;
  revparSen: number;
}

// ---------------------------------------------------------------------------
// Late submissions
// ---------------------------------------------------------------------------

export interface SubmissionTiming {
  date: string;
  submittedAt: Date | null;
}

/**
 * How many reports in the period were filed more than `thresholdHours` after
 * their business date ended (its cutoff the next morning). The house rule is
 * to submit before the shift hands over; this counts the ones that slipped.
 * Reports with no `submittedAt` are skipped. Never affects whether a report
 * could be submitted — it only measures timing after the fact.
 */
export function lateSubmissionCount(
  days: SubmissionTiming[],
  cutoffHour: number,
  thresholdHours: number,
): number {
  return days.filter(
    (d) =>
      d.submittedAt != null &&
      isLateSubmission(d.date, d.submittedAt, thresholdHours, cutoffHour),
  ).length;
}

export function occupancy(
  nightDays: NightDayDoc[],
  roomsAvailableFallback: number | null,
): OccupancyResult {
  let soldTotal = 0;
  let availableTotal = 0;
  let roomRevenueSen = 0;

  for (const d of nightDays) {
    const avail =
      d.rooms.available > 0 ? d.rooms.available : (roomsAvailableFallback ?? 0);
    soldTotal += d.rooms.sold;
    availableTotal += avail;
    roomRevenueSen += d.rooms.revenueSen;
  }

  return {
    soldTotal,
    availableTotal,
    roomRevenueSen,
    occupancyRatio: calcOccupancyRatio(soldTotal, availableTotal),
    adrSen: calcAdrSen(roomRevenueSen, soldTotal),
    revparSen: calcRevparSen(roomRevenueSen, availableTotal),
  };
}
