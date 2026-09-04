/**
 * Pure aggregation functions for the /reports daily breakdown table and its
 * per-day drill-down panel. NO database imports — takes already-fetched
 * plain objects, same split as `lib/reportSummary.ts` / `lib/otaSummary.ts`.
 *
 * Scope decision: the table and its drill-down are a breakdown of NIGHT
 * REPORTS specifically (one row per business day), so "total revenue" and
 * the Revenue tab are built from the night report alone — never mixed with
 * standalone `revenueEntries`, which belong to the whole-range summary
 * higher up the page (`lib/reportSummary.ts`), not to a single calendar
 * day. The Expenses tab is the one explicit exception: the spec calls out
 * "petty cash lines from the night report and any standalone expenses
 * dated that day" by name, so expense figures below do combine both.
 */

import { formatBusinessDateLabel } from "./businessDate";
import { occupancyRatio, isSelfApproved, otaReceivableSen } from "./nightReport";

// ---------------------------------------------------------------------------
// Input shapes (plain objects extracted from DB docs)
// ---------------------------------------------------------------------------

export interface DailyOtaBookingLine {
  platformId: string;
  bookingsCount: number;
  roomRevenueSen: number;
  guestPaidPlatform: boolean;
}

export interface DailyExpenseLine {
  category: string;
  amountSen: number;
  paidTo?: string;
  paidBy: "cash" | "card";
}

export interface DailyRevenueLine {
  category: string;
  amountSen: number;
  note?: string;
}

export interface RawNightDay {
  id: string;
  date: string;
  status: "submitted" | "approved" | "queried";
  rooms: { available: number; sold: number; houseUse: number; revenueSen: number };
  revenueLines: DailyRevenueLine[];
  otaBookings: DailyOtaBookingLine[];
  collections: {
    cashSen: number;
    cardSen: number;
    transferSen: number;
    ewalletSen: number;
    chargeToAccountSen: number;
    depositsSen: number;
    refundsSen: number;
    receivablesSettledSen: number;
  };
  expenses: DailyExpenseLine[];
  varianceSen?: number;
  submittedBy?: string | null;
  approvedBy?: string | null;
  enteredLate?: boolean;
}

export interface StandaloneExpenseForDay {
  categoryId: string;
  amountSen: number;
  paymentMethodId: string;
  paidTo?: string;
  linkedBusinessDayId: string | null;
}

// ---------------------------------------------------------------------------
// Date range enumeration
// ---------------------------------------------------------------------------

/** Every YYYY-MM-DD date from `from` to `to` inclusive, ascending. A gap in
 * the data must be visible, so the table walks every calendar date in the
 * range rather than only the ones with a document. */
export function enumerateDates(from: string, to: string): string[] {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!m1 || !m2) throw new Error("enumerateDates: dates must be YYYY-MM-DD.");
  // Noon UTC throughout so incrementing a day never straddles a boundary.
  const start = Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]), 12);
  const end = Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 12);
  const dates: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Daily row
// ---------------------------------------------------------------------------

export type DailyRowStatus = "submitted" | "approved" | "queried" | "missing";

/** Shared with the PDF export (lib/pdf/reportDocument.tsx) so the on-screen
 * table and the printed one never use different words for the same status. */
export const DAILY_ROW_STATUS_LABEL: Record<DailyRowStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  queried: "Queried",
  missing: "No report",
};

export interface DailyBreakdownRow {
  date: string;
  label: string; // e.g. "Thu 3 Sep" — server-computed, never client date math
  status: DailyRowStatus;
  businessDayId: string | null;
  roomsSold: number;
  roomsAvailable: number;
  occupancyRatio: number | null; // null when no room count is known at all
  totalRevenueSen: number;
  cashSen: number;
  transferSen: number; // DuitNow / bank transfer / QR
  cardSen: number;
  ewalletSen: number;
  otaReceivableSen: number;
  expensesSen: number; // night-report petty cash + standalone expenses dated this day
  varianceSen: number | null;
  backdated: boolean;
  selfApproved: boolean;
}

/**
 * Build one table row. `day` is null for a date with no submitted report at
 * all — that date still gets a row, marked "missing" (a gap must be
 * visible, never silently skipped), and still picks up any standalone
 * expenses recorded against it.
 */
export function buildDailyRow(
  date: string,
  day: RawNightDay | null,
  standaloneExpensesSen: number,
  roomsAvailableFallback: number | null,
): DailyBreakdownRow {
  const label = formatBusinessDateLabel(date);

  if (!day) {
    return {
      date,
      label,
      status: "missing",
      businessDayId: null,
      roomsSold: 0,
      roomsAvailable: 0,
      occupancyRatio: null,
      totalRevenueSen: 0,
      cashSen: 0,
      transferSen: 0,
      cardSen: 0,
      ewalletSen: 0,
      otaReceivableSen: 0,
      expensesSen: standaloneExpensesSen,
      varianceSen: null,
      backdated: false,
      selfApproved: false,
    };
  }

  const roomsAvailable =
    day.rooms.available > 0 ? day.rooms.available : (roomsAvailableFallback ?? 0);
  const revenueLinesTotalSen = day.revenueLines.reduce((s, l) => s + l.amountSen, 0);
  const nightExpensesSen = day.expenses.reduce((s, e) => s + e.amountSen, 0);

  return {
    date,
    label,
    status: day.status,
    businessDayId: day.id,
    roomsSold: day.rooms.sold,
    roomsAvailable,
    occupancyRatio: roomsAvailable > 0 ? occupancyRatio(day.rooms.sold, roomsAvailable) : null,
    totalRevenueSen: day.rooms.revenueSen + revenueLinesTotalSen,
    cashSen: day.collections.cashSen,
    transferSen: day.collections.transferSen,
    cardSen: day.collections.cardSen,
    ewalletSen: day.collections.ewalletSen,
    otaReceivableSen: otaReceivableSen(day.otaBookings),
    expensesSen: nightExpensesSen + standaloneExpensesSen,
    varianceSen: day.varianceSen ?? null,
    backdated: !!day.enteredLate,
    selfApproved: isSelfApproved(day.submittedBy ?? "", day.approvedBy ?? null),
  };
}

// ---------------------------------------------------------------------------
// Totals row
// ---------------------------------------------------------------------------

export interface DailyBreakdownTotals {
  roomsSold: number;
  roomsAvailable: number;
  occupancyRatio: number | null;
  totalRevenueSen: number;
  cashSen: number;
  transferSen: number;
  cardSen: number;
  ewalletSen: number;
  otaReceivableSen: number;
  expensesSen: number;
  varianceSen: number;
  missingCount: number;
}

export function dailyBreakdownTotals(rows: DailyBreakdownRow[]): DailyBreakdownTotals {
  const sum = (f: (r: DailyBreakdownRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const roomsSold = sum((r) => r.roomsSold);
  const roomsAvailable = sum((r) => r.roomsAvailable);
  return {
    roomsSold,
    roomsAvailable,
    occupancyRatio: roomsAvailable > 0 ? occupancyRatio(roomsSold, roomsAvailable) : null,
    totalRevenueSen: sum((r) => r.totalRevenueSen),
    cashSen: sum((r) => r.cashSen),
    transferSen: sum((r) => r.transferSen),
    cardSen: sum((r) => r.cardSen),
    ewalletSen: sum((r) => r.ewalletSen),
    otaReceivableSen: sum((r) => r.otaReceivableSen),
    expensesSen: sum((r) => r.expensesSen),
    varianceSen: sum((r) => r.varianceSen ?? 0),
    missingCount: rows.filter((r) => r.status === "missing").length,
  };
}

// ---------------------------------------------------------------------------
// Channel summary — total per channel for the whole range, plus each as a
// percentage of the five-channel total: the four collection methods the
// table already breaks out, plus OTA (a receivable, not yet collected, but
// listed here because "how much of this period's business came through
// OTAs" is the same kind of question as "how much came through QR").
// ---------------------------------------------------------------------------

export interface ChannelSummaryItem {
  channel: string;
  amountSen: number;
  pct: number; // 0–100, one decimal place
}

export function dailyChannelSummary(rows: DailyBreakdownRow[]): ChannelSummaryItem[] {
  const cashSen = rows.reduce((s, r) => s + r.cashSen, 0);
  const transferSen = rows.reduce((s, r) => s + r.transferSen, 0);
  const cardSen = rows.reduce((s, r) => s + r.cardSen, 0);
  const ewalletSen = rows.reduce((s, r) => s + r.ewalletSen, 0);
  const otaSen = rows.reduce((s, r) => s + r.otaReceivableSen, 0);
  const totalSen = cashSen + transferSen + cardSen + ewalletSen + otaSen;
  const pct = (amountSen: number) =>
    totalSen > 0 ? Math.round((amountSen / totalSen) * 1000) / 10 : 0;
  return [
    { channel: "Cash", amountSen: cashSen, pct: pct(cashSen) },
    { channel: "DuitNow / QR", amountSen: transferSen, pct: pct(transferSen) },
    { channel: "Card", amountSen: cardSen, pct: pct(cardSen) },
    { channel: "E-wallet", amountSen: ewalletSen, pct: pct(ewalletSen) },
    { channel: "OTA", amountSen: otaSen, pct: pct(otaSen) },
  ];
}

// ---------------------------------------------------------------------------
// Monthly grouping — for ranges longer than 31 days, the table shows one row
// per month instead of one per day. Built by grouping the same daily rows
// used everywhere else on the page (channel summary, totals, CSV), so a
// month's figures can never drift from what its days say; `dailyBreakdownTotals`
// does the actual summing, applied per month bucket instead of once for the
// whole range.
// ---------------------------------------------------------------------------

export interface MonthlyBreakdownRow {
  month: string; // "YYYY-MM"
  label: string; // e.g. "Sep 2026"
  dayRows: DailyBreakdownRow[]; // the days of this month that fall inside the range
  roomsSold: number;
  roomsAvailable: number;
  occupancyRatio: number | null;
  totalRevenueSen: number;
  cashSen: number;
  transferSen: number;
  cardSen: number;
  ewalletSen: number;
  otaReceivableSen: number;
  expensesSen: number;
  varianceSen: number;
  missingCount: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function groupRowsByMonth(rows: DailyBreakdownRow[]): MonthlyBreakdownRow[] {
  const byMonth = new Map<string, DailyBreakdownRow[]>();
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(r);
    else byMonth.set(month, [r]);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, dayRows]) => {
      const t = dailyBreakdownTotals(dayRows);
      const [y, m] = month.split("-");
      return {
        month,
        label: `${MONTH_LABELS[Number(m) - 1]} ${y}`,
        dayRows,
        roomsSold: t.roomsSold,
        roomsAvailable: t.roomsAvailable,
        occupancyRatio: t.occupancyRatio,
        totalRevenueSen: t.totalRevenueSen,
        cashSen: t.cashSen,
        transferSen: t.transferSen,
        cardSen: t.cardSen,
        ewalletSen: t.ewalletSen,
        otaReceivableSen: t.otaReceivableSen,
        expensesSen: t.expensesSen,
        varianceSen: t.varianceSen,
        missingCount: t.missingCount,
      };
    });
}

// ---------------------------------------------------------------------------
// Revenue drill-down
// ---------------------------------------------------------------------------

export interface RevenueDetailCollectionLine {
  label: string;
  amountSen: number;
}

export interface RevenueDetailOtaLine {
  platformId: string;
  platformName: string;
  bookingsCount: number;
  roomRevenueSen: number;
  guestPaidPlatform: boolean;
}

export interface RevenueDetail {
  roomRevenueDirectSen: number;
  roomRevenueOtaSen: number;
  revenueLines: DailyRevenueLine[];
  collections: RevenueDetailCollectionLine[];
  otaBookings: RevenueDetailOtaLine[];
  totalSen: number;
}

/** Room revenue for an OTA booking already lives inside `rooms.revenueSen`
 * (CLAUDE.md's OTA section) — so "direct" is the remainder after every OTA
 * line's room revenue is subtracted out, not a separately-entered figure. */
export function buildRevenueDetail(
  day: RawNightDay,
  platformNameById: Map<string, string>,
): RevenueDetail {
  const roomRevenueOtaSen = day.otaBookings.reduce((s, b) => s + b.roomRevenueSen, 0);
  const roomRevenueDirectSen = day.rooms.revenueSen - roomRevenueOtaSen;
  const revenueLinesTotalSen = day.revenueLines.reduce((s, l) => s + l.amountSen, 0);

  return {
    roomRevenueDirectSen,
    roomRevenueOtaSen,
    revenueLines: day.revenueLines,
    collections: [
      { label: "Cash", amountSen: day.collections.cashSen },
      { label: "DuitNow / transfer / QR", amountSen: day.collections.transferSen },
      { label: "Card", amountSen: day.collections.cardSen },
      { label: "E-wallet", amountSen: day.collections.ewalletSen },
      { label: "Charge to account", amountSen: day.collections.chargeToAccountSen },
      { label: "Deposits", amountSen: day.collections.depositsSen },
      { label: "Refunds", amountSen: day.collections.refundsSen },
      { label: "Receivables settled", amountSen: day.collections.receivablesSettledSen },
    ],
    otaBookings: day.otaBookings.map((b) => ({
      platformId: b.platformId,
      platformName: platformNameById.get(b.platformId) ?? "Unknown platform",
      bookingsCount: b.bookingsCount,
      roomRevenueSen: b.roomRevenueSen,
      guestPaidPlatform: b.guestPaidPlatform,
    })),
    totalSen: day.rooms.revenueSen + revenueLinesTotalSen,
  };
}

// ---------------------------------------------------------------------------
// Expense drill-down
// ---------------------------------------------------------------------------

export interface ExpenseDetailLine {
  source: "night" | "standalone";
  category: string;
  amountSen: number;
  paymentMethodLabel: string;
  paidTo: string;
}

export interface ExpenseDetail {
  lines: ExpenseDetailLine[];
  totalSen: number;
}

const PAID_BY_LABEL: Record<"cash" | "card", string> = { cash: "Cash", card: "Card" };

export function buildExpenseDetail(
  nightExpenses: DailyExpenseLine[],
  standaloneExpenses: StandaloneExpenseForDay[],
  categoryNameById: Map<string, string>,
  paymentMethodNameById: Map<string, string>,
): ExpenseDetail {
  const lines: ExpenseDetailLine[] = [
    ...nightExpenses.map((e) => ({
      source: "night" as const,
      category: e.category,
      amountSen: e.amountSen,
      paymentMethodLabel: PAID_BY_LABEL[e.paidBy],
      paidTo: e.paidTo?.trim() || "—",
    })),
    ...standaloneExpenses
      .filter((e) => e.linkedBusinessDayId === null)
      .map((e) => ({
        source: "standalone" as const,
        category: categoryNameById.get(e.categoryId) ?? e.categoryId,
        amountSen: e.amountSen,
        paymentMethodLabel: paymentMethodNameById.get(e.paymentMethodId) ?? "Unknown",
        paidTo: e.paidTo?.trim() || "—",
      })),
  ];
  return { lines, totalSen: lines.reduce((s, l) => s + l.amountSen, 0) };
}
