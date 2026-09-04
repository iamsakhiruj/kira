/**
 * Server-side data assembly for /reports. Fetches from Mongo and feeds the
 * pure functions in lib/reportSummary.ts and lib/dailyBreakdown.ts — one
 * place, so the page and the PDF export can never disagree about what a
 * given range's numbers are. The CSV export routes predate this module and
 * are kept exactly as they were (per the rework brief: "CSV EXPORT — kept,
 * unchanged") — they are NOT wired to this.
 */

import { getSettings, type PropertySettings } from "./settings";
import { getBusinessDaysBetween } from "./businessDays";
import { getRevenueEntriesBetween } from "./revenueEntriesStore";
import { getExpensesBetween, type StoredExpense } from "./expensesStore";
import { getAllCategories } from "./categoriesStore";
import { getPaymentMethods } from "./paymentMethodsStore";
import { getOtaPlatforms } from "./otaPlatformsStore";
import { sumBookingNightsBetween, getBookingsCancelledBetween } from "./bookingsStore";
import { getUserNamesByIds } from "./users";
import { previousEquivalentRange } from "./dateRangePresets";
import {
  buildNightExpenseLedgerLines,
  buildStandaloneExpenseLedgerLines,
  type ExpenseLedgerLine,
} from "./expenseLedger";
import {
  revenueBySource,
  expensesByCategory,
  netProfitSen,
  occupancy,
  cancellationSummary,
  type NightDayDoc,
  type StandaloneEntry,
} from "./reportSummary";
import { totalRevenueSen } from "./nightReport";
import {
  enumerateDates,
  buildDailyRow,
  dailyBreakdownTotals,
  dailyChannelSummary,
  groupRowsByMonth,
  buildRevenueDetail,
  buildExpenseDetail,
  type RawNightDay,
  type DailyBreakdownRow,
  type MonthlyBreakdownRow,
  type ChannelSummaryItem,
  type DailyBreakdownTotals,
  type RevenueDetail,
  type ExpenseDetail,
} from "./dailyBreakdown";

// A range this long or shorter gets one table row per day; anything longer
// gets one row per month (expandable to days) — the rework brief's rule.
const MONTHLY_THRESHOLD_DAYS = 31;

// ---------------------------------------------------------------------------
// Raw-doc mappers — same shape-defaulting idiom used throughout /reports.
// ---------------------------------------------------------------------------

function toNightDayDoc(doc: Record<string, unknown>): NightDayDoc {
  const rooms = (doc.rooms as NightDayDoc["rooms"]) ?? {
    available: 0, sold: 0, houseUse: 0, revenueSen: 0,
  };
  const revenueLines = (doc.revenueLines as NightDayDoc["revenueLines"]) ?? [];
  const otaBookings = (doc.otaBookings as NightDayDoc["otaBookings"]) ?? [];
  const expenses = (doc.expenses as NightDayDoc["expenses"]) ?? [];
  const collections = (doc.collections as NightDayDoc["collections"]) ?? {
    cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0,
    chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0,
  };
  const cash = (doc.cash as NightDayDoc["cash"]) ?? {
    openingFloatSen: 0, bankedInSen: 0, countedSen: 0,
  };
  return { rooms, revenueLines, otaBookings, expenses, collections, cash };
}

function toRawNightDay(doc: Record<string, unknown>): RawNightDay {
  const rooms = (doc.rooms as RawNightDay["rooms"]) ?? {
    available: 0, sold: 0, houseUse: 0, revenueSen: 0,
  };
  const revenueLines = (doc.revenueLines as RawNightDay["revenueLines"]) ?? [];
  const otaBookings = (doc.otaBookings as RawNightDay["otaBookings"]) ?? [];
  const expenses = (doc.expenses as RawNightDay["expenses"]) ?? [];
  const collections = (doc.collections as RawNightDay["collections"]) ?? {
    cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0,
    chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0,
  };
  return {
    id: String(doc._id),
    date: String(doc.date),
    status: (doc.status as RawNightDay["status"]) ?? "submitted",
    rooms,
    revenueLines,
    otaBookings,
    collections,
    expenses,
    varianceSen: typeof doc.varianceSen === "number" ? doc.varianceSen : undefined,
    submittedBy: typeof doc.submittedBy === "string" ? doc.submittedBy : null,
    approvedBy: typeof doc.approvedBy === "string" ? doc.approvedBy : null,
    enteredLate: !!doc.enteredLate,
  };
}

function toStandaloneEntry(doc: Record<string, unknown>): StandaloneEntry {
  return {
    amountSen: (doc.amountSen as number) ?? 0,
    linkedBusinessDayId: (doc.linkedBusinessDayId as string | null) ?? null,
    categoryId: (doc.categoryId as string) ?? "",
    paymentMethodId: (doc.paymentMethodId as string) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ReportScope {
  /** Restrict to one submitter's own business days — reception (rule 7). */
  submittedByUserId?: string;
  /** Whether to fold in standalone revenue/expenses, booking accrual and
   * cancellations — manager+ concepts that reception never sees. */
  includeStandalone: boolean;
}

export interface HeadlineMetrics {
  revenueSen: number;
  expenseSen: number;
  profitSen: number;
  occupancyRatio: number | null;
}

export interface DailyBreakdownDetail {
  revenue: RevenueDetail | null; // null when there is no night report for the date
  expenses: ExpenseDetail;
}

export interface ReportCategoryAmount {
  name: string;
  amountSen: number;
}

export interface ReportData {
  from: string;
  to: string;
  mode: "daily" | "monthly";
  dailyRows: DailyBreakdownRow[];
  monthlyRows: MonthlyBreakdownRow[] | null;
  totals: DailyBreakdownTotals;
  channelSummary: ChannelSummaryItem[];
  /** Largest first — same sort `expensesByCategory` already returns. */
  expenseCategories: ReportCategoryAmount[];
  details: Record<string, DailyBreakdownDetail>;
  headline: HeadlineMetrics;
  previousRange: { from: string; to: string };
  previousHeadline: HeadlineMetrics;
  /** Every individual expense in the range — manager+ only (rule 7).
   * Null for a reception-scoped request: never fetched, never built, so
   * there's nothing to accidentally leak through the UI. */
  expenseLedger: ExpenseLedgerLine[] | null;
}

// ---------------------------------------------------------------------------
// Headline metrics for one range
// ---------------------------------------------------------------------------

interface StandaloneBundle {
  revenueEntries: Record<string, unknown>[];
  expenses: StoredExpense[];
  bookingAccrual: { roomRevenueSen: number; tourismTaxSen: number };
  cancelledBookings: Record<string, unknown>[];
}

async function fetchStandaloneBundle(from: string, to: string): Promise<StandaloneBundle> {
  const [revenueEntries, expenses, bookingAccrual, cancelledBookings] = await Promise.all([
    getRevenueEntriesBetween(from, to),
    getExpensesBetween(from, to),
    sumBookingNightsBetween(from, to),
    getBookingsCancelledBetween(from, to),
  ]);
  return {
    revenueEntries: revenueEntries as unknown as Record<string, unknown>[],
    expenses,
    bookingAccrual,
    cancelledBookings: cancelledBookings as unknown as Record<string, unknown>[],
  };
}

function computeHeadline(
  nightDays: NightDayDoc[],
  settings: PropertySettings,
  standalone: StandaloneBundle | null,
): HeadlineMetrics {
  const occ = occupancy(nightDays, settings.roomsAvailable);
  const occupancyRatio = occ.availableTotal > 0 ? occ.occupancyRatio : null;

  if (!standalone) {
    const revenueSen = nightDays.reduce(
      (s, d) => s + totalRevenueSen(d.rooms.revenueSen, d.revenueLines),
      0,
    );
    const expenseSen = nightDays.reduce(
      (s, d) => s + d.expenses.reduce((es, e) => es + e.amountSen, 0),
      0,
    );
    return { revenueSen, expenseSen, profitSen: netProfitSen(revenueSen, expenseSen), occupancyRatio };
  }

  const standaloneRevenue = standalone.revenueEntries.map(toStandaloneEntry);
  const standaloneExpenses = standalone.expenses.map((e) =>
    toStandaloneEntry(e as unknown as Record<string, unknown>),
  );
  const cancellations = cancellationSummary(
    standalone.cancelledBookings.map((b) => {
      const c = (b.cancellation as Record<string, unknown>) ?? {};
      return {
        status: String(b.status ?? ""),
        bookingValueSen: Number(c.bookingValueSen) || 0,
        forfeitedSen: Number(c.forfeitedSen) || 0,
      };
    }),
  );
  const revSummary = revenueBySource(
    nightDays,
    standaloneRevenue,
    new Map(), // category names aren't needed for a total-only figure
    standalone.bookingAccrual.roomRevenueSen,
    cancellations.depositsForfeitedSen,
  );
  const expSummary = expensesByCategory(nightDays, standaloneExpenses, new Map());
  return {
    revenueSen: revSummary.totalSen,
    expenseSen: expSummary.totalSen,
    profitSen: netProfitSen(revSummary.totalSen, expSummary.totalSen),
    occupancyRatio,
  };
}

// ---------------------------------------------------------------------------
// Full report assembly
// ---------------------------------------------------------------------------

export async function buildReportData(
  from: string,
  to: string,
  scope: ReportScope,
): Promise<ReportData> {
  const settings = await getSettings();
  const previousRange = previousEquivalentRange(from, to);

  const [
    currentDaysDocs,
    currentStandalone,
    previousDaysDocs,
    previousStandalone,
    revCats,
    expCats,
    paymentMethods,
    otaPlatforms,
  ] = await Promise.all([
    getBusinessDaysBetween(from, to),
    scope.includeStandalone ? fetchStandaloneBundle(from, to) : Promise.resolve(null),
    getBusinessDaysBetween(previousRange.from, previousRange.to),
    scope.includeStandalone
      ? fetchStandaloneBundle(previousRange.from, previousRange.to)
      : Promise.resolve(null),
    scope.includeStandalone ? getAllCategories("revenue") : Promise.resolve([]),
    scope.includeStandalone ? getAllCategories("expense") : Promise.resolve([]),
    scope.includeStandalone ? getPaymentMethods() : Promise.resolve([]),
    // OTA platform names are needed even for reception's own-days drill-down.
    getOtaPlatforms(),
  ]);

  const scopeFilter = (docs: typeof currentDaysDocs) =>
    scope.submittedByUserId
      ? docs.filter((d) => String(d.submittedBy) === scope.submittedByUserId)
      : docs;

  const currentDays = scopeFilter(currentDaysDocs);
  const previousDays = scopeFilter(previousDaysDocs);

  const currentNightDays = currentDays.map((d) => toNightDayDoc(d as Record<string, unknown>));
  const previousNightDays = previousDays.map((d) => toNightDayDoc(d as Record<string, unknown>));

  const headline = computeHeadline(currentNightDays, settings, currentStandalone);
  const previousHeadline = computeHeadline(previousNightDays, settings, previousStandalone);

  // ---- Table rows, channel summary, category bars, drill-down details ----

  const dates = enumerateDates(from, to);
  const rawNightDayByDate = new Map(
    currentDays.map((d) => [String(d.date), toRawNightDay(d as Record<string, unknown>)]),
  );

  const standaloneExpensesByDate = new Map<string, StoredExpense[]>();
  if (currentStandalone) {
    for (const e of currentStandalone.expenses) {
      if (e.linkedBusinessDayId !== null) continue;
      const d = String(e.date);
      const bucket = standaloneExpensesByDate.get(d);
      if (bucket) bucket.push(e);
      else standaloneExpensesByDate.set(d, [e]);
    }
  }

  const dailyRows = dates.map((date) => {
    const day = rawNightDayByDate.get(date) ?? null;
    const standaloneSen = (standaloneExpensesByDate.get(date) ?? []).reduce(
      (s, e) => s + e.amountSen,
      0,
    );
    return buildDailyRow(date, day, standaloneSen, settings.roomsAvailable);
  });

  const totals = dailyBreakdownTotals(dailyRows);
  const channelSummary = dailyChannelSummary(dailyRows);

  const categoryNameById = new Map(
    [...revCats, ...expCats].map((c) => [c._id.toString(), c.name]),
  );
  const paymentMethodNameById = new Map(paymentMethods.map((m) => [m._id.toString(), m.name]));
  const platformNameById = new Map(otaPlatforms.map((p) => [p._id.toString(), p.name]));

  const details: Record<string, DailyBreakdownDetail> = Object.fromEntries(
    dates.map((date) => {
      const day = rawNightDayByDate.get(date) ?? null;
      const standaloneForDate = (standaloneExpensesByDate.get(date) ?? []).map((e) => ({
        categoryId: e.categoryId,
        amountSen: e.amountSen,
        paymentMethodId: e.paymentMethodId,
        paidTo: e.paidTo,
        linkedBusinessDayId: e.linkedBusinessDayId,
      }));
      return [
        date,
        {
          revenue: day ? buildRevenueDetail(day, platformNameById) : null,
          expenses: buildExpenseDetail(
            day?.expenses ?? [],
            standaloneForDate,
            categoryNameById,
            paymentMethodNameById,
          ),
        },
      ];
    }),
  );

  const expenseCategories = expensesByCategory(
    currentNightDays,
    currentStandalone ? currentStandalone.expenses.map((e) => toStandaloneEntry(e as unknown as Record<string, unknown>)) : [],
    categoryNameById,
  ).categories;

  const mode: "daily" | "monthly" = dates.length <= MONTHLY_THRESHOLD_DAYS ? "daily" : "monthly";
  const monthlyRows = mode === "monthly" ? groupRowsByMonth(dailyRows) : null;

  // ---- Itemised expense ledger — manager+ only (rule 7) ----

  let expenseLedger: ExpenseLedgerLine[] | null = null;
  if (currentStandalone) {
    const submitterIds = currentDays
      .map((d) => (d as Record<string, unknown>).submittedBy)
      .filter((v): v is string => typeof v === "string");
    const recorderIds = currentStandalone.expenses.map((e) => e.paidBy);
    const userNameById = await getUserNamesByIds([...submitterIds, ...recorderIds]);

    const nightLedgerLines = currentDays.flatMap((d) => {
      const raw = d as Record<string, unknown>;
      const date = String(raw.date);
      const submittedBy = typeof raw.submittedBy === "string" ? raw.submittedBy : "";
      const expenses = (raw.expenses as RawNightDay["expenses"]) ?? [];
      return buildNightExpenseLedgerLines(
        date,
        expenses,
        userNameById.get(submittedBy) ?? "Unknown",
      );
    });
    const standaloneLedgerLines = buildStandaloneExpenseLedgerLines(
      currentStandalone.expenses,
      categoryNameById,
      paymentMethodNameById,
      userNameById,
    );
    expenseLedger = [...nightLedgerLines, ...standaloneLedgerLines];
  }

  return {
    from,
    to,
    mode,
    dailyRows,
    monthlyRows,
    totals,
    channelSummary,
    expenseCategories,
    details,
    headline,
    previousRange,
    previousHeadline,
    expenseLedger,
  };
}
