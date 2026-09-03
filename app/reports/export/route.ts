import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getBusinessDaysBetween } from "@/lib/businessDays";
import {
  sumBookingNightsBetween,
  getBookingsByCheckInBetween,
  getBookingsCancelledBetween,
} from "@/lib/bookingsStore";
import { getRevenueEntriesBetween } from "@/lib/revenueEntriesStore";
import { getExpensesBetween } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { fromSen } from "@/lib/money";
import {
  revenueBySource,
  expensesByCategory,
  netProfitSen,
  guestsByNationality,
  cancellationSummary,
  type NightDayDoc,
  type StandaloneEntry,
} from "@/lib/reportSummary";

export const dynamic = "force-dynamic";

function csvEscape(val: string): string {
  if (val.includes('"') || val.includes(",") || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function row(...cols: string[]): string {
  return cols.map(csvEscape).join(",") + "\r\n";
}

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

function toStandaloneEntry(doc: Record<string, unknown>): StandaloneEntry {
  return {
    amountSen: (doc.amountSen as number) ?? 0,
    linkedBusinessDayId: (doc.linkedBusinessDayId as string | null) ?? null,
    categoryId: (doc.categoryId as string) ?? "",
    paymentMethodId: (doc.paymentMethodId as string) ?? "",
  };
}

function lastDayOfMonthStr(yearStr: string, monthStr: string): string {
  const y = Number(yearStr);
  const m = Number(monthStr);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearStr}-${monthStr}-${String(last).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAuthorized(user.role, "manager")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const settings = await getSettings();
  const today = businessDateFor(new Date(), settings.cutoffHour);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const rawFrom = req.nextUrl.searchParams.get("from");
  const rawTo = req.nextUrl.searchParams.get("to");

  // Default: this month
  const [ty, tm] = today.split("-");
  const defaultFrom = `${ty}-${tm}-01`;
  const defaultTo = lastDayOfMonthStr(ty, tm);

  const rangeFrom = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : defaultFrom;
  const rangeTo = rawTo && DATE_RE.test(rawTo) ? rawTo : defaultTo;

  // Ensure from <= to
  const clampedFrom = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
  const clampedTo = rangeFrom <= rangeTo ? rangeTo : rangeFrom;

  const [
    allDays,
    revenueEntries,
    expenses,
    revCats,
    expCats,
    bookingAccrual,
    arrivingBookings,
    cancelledBookings,
  ] = await Promise.all([
      getBusinessDaysBetween(clampedFrom, clampedTo),
      getRevenueEntriesBetween(clampedFrom, clampedTo),
      getExpensesBetween(clampedFrom, clampedTo),
      getAllCategories("revenue"),
      getAllCategories("expense"),
      sumBookingNightsBetween(clampedFrom, clampedTo),
      getBookingsByCheckInBetween(clampedFrom, clampedTo),
      getBookingsCancelledBetween(clampedFrom, clampedTo),
    ]);

  const cancellations = cancellationSummary(
    cancelledBookings.map((b) => {
      const c = (b.cancellation as Record<string, unknown>) ?? {};
      return {
        status: String(b.status ?? ""),
        bookingValueSen: Number(c.bookingValueSen) || 0,
        forfeitedSen: Number(c.forfeitedSen) || 0,
      };
    }),
  );

  const nightDays = allDays.map((d) => toNightDayDoc(d as Record<string, unknown>));
  const standaloneRevenue = revenueEntries.map((e) =>
    toStandaloneEntry(e as unknown as Record<string, unknown>),
  );
  const standaloneExpenses = expenses.map((e) =>
    toStandaloneEntry(e as unknown as Record<string, unknown>),
  );

  const allCategories = [...revCats, ...expCats];
  const categoryNameById = new Map(allCategories.map((c) => [c._id.toString(), c.name]));

  const revSummary = revenueBySource(
    nightDays,
    standaloneRevenue,
    categoryNameById,
    bookingAccrual.roomRevenueSen,
    cancellations.depositsForfeitedSen,
  );
  const expSummary = expensesByCategory(nightDays, standaloneExpenses, categoryNameById);

  let csv = "";
  csv += row("Period", `${clampedFrom} to ${clampedTo}`, "");
  csv += row("Section", "Category / Source", "Amount (RM)");

  // Revenue
  csv += row("Revenue", "", "");
  for (const s of revSummary.sources) {
    csv += row("Revenue", s.name, fromSen(s.amountSen));
  }
  csv += row("Revenue", "Total", fromSen(revSummary.totalSen));

  // Expenses
  csv += row("Expenses", "", "");
  for (const c of expSummary.categories) {
    csv += row("Expenses", c.name, fromSen(c.amountSen));
  }
  csv += row("Expenses", "Total", fromSen(expSummary.totalSen));

  // Tourism tax collected — a liability to remit, never revenue (bookings §1).
  if (bookingAccrual.tourismTaxSen > 0) {
    csv += row("Tourism tax collected", "", fromSen(bookingAccrual.tourismTaxSen));
  }

  // Guests by nationality — count per market for the period.
  const nationalities = guestsByNationality(
    arrivingBookings.map((b) => ({
      nationality: String(b.nationality ?? ""),
      status: String(b.status ?? ""),
    })),
  );
  if (nationalities.length > 0) {
    csv += row("Guests by nationality", "", "");
    for (const n of nationalities) {
      csv += row("Guests by nationality", n.name, String(n.count));
    }
  }

  // Cancellations & no-shows — count, value, deposits forfeited.
  if (cancellations.cancelledCount + cancellations.noShowCount > 0) {
    csv += row("Cancellations & no-shows", "", "");
    csv += row(
      "Cancellations & no-shows",
      `Cancelled (${cancellations.cancelledCount})`,
      fromSen(cancellations.cancelledValueSen),
    );
    csv += row(
      "Cancellations & no-shows",
      `No-shows (${cancellations.noShowCount})`,
      fromSen(cancellations.noShowValueSen),
    );
    csv += row(
      "Cancellations & no-shows",
      "Deposits forfeited",
      fromSen(cancellations.depositsForfeitedSen),
    );
  }

  // Net profit — owner only
  if (isAuthorized(user.role, "owner")) {
    const profit = netProfitSen(revSummary.totalSen, expSummary.totalSen);
    csv += row("Net profit", "", fromSen(profit));
  }

  const filename = `report-${clampedFrom}-to-${clampedTo}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
