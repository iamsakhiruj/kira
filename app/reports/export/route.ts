import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getBusinessDaysBetween } from "@/lib/businessDays";
import { getRevenueEntriesBetween } from "@/lib/revenueEntriesStore";
import { getExpensesBetween } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { fromSen } from "@/lib/money";
import {
  revenueBySource,
  expensesByCategory,
  netProfitSen,
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

  const [allDays, revenueEntries, expenses, revCats, expCats] = await Promise.all([
    getBusinessDaysBetween(clampedFrom, clampedTo),
    getRevenueEntriesBetween(clampedFrom, clampedTo),
    getExpensesBetween(clampedFrom, clampedTo),
    getAllCategories("revenue"),
    getAllCategories("expense"),
  ]);

  const nightDays = allDays.map((d) => toNightDayDoc(d as Record<string, unknown>));
  const standaloneRevenue = revenueEntries.map((e) =>
    toStandaloneEntry(e as unknown as Record<string, unknown>),
  );
  const standaloneExpenses = expenses.map((e) =>
    toStandaloneEntry(e as unknown as Record<string, unknown>),
  );

  const allCategories = [...revCats, ...expCats];
  const categoryNameById = new Map(allCategories.map((c) => [c._id.toString(), c.name]));

  const revSummary = revenueBySource(nightDays, standaloneRevenue, categoryNameById);
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
