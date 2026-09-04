import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getBusinessDaysBetween } from "@/lib/businessDays";
import { getExpensesBetween } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getUserNamesByIds } from "@/lib/users";
import { csvRow as row } from "@/lib/csv";
import { fromSen } from "@/lib/money";
import {
  enumerateDates,
  buildDailyRow,
  dailyBreakdownTotals,
  type RawNightDay,
} from "@/lib/dailyBreakdown";
import {
  buildNightExpenseLedgerLines,
  buildStandaloneExpenseLedgerLines,
  groupExpenseLedgerByDate,
  ledgerGrandTotalSen,
} from "@/lib/expenseLedger";

export const dynamic = "force-dynamic";

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

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  queried: "Queried",
  missing: "No report",
};

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
  const [ty, tm] = today.split("-");
  const defaultFrom = `${ty}-${tm}-01`;

  const rangeFrom = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : defaultFrom;
  const rangeTo = rawTo && DATE_RE.test(rawTo) ? rawTo : today;
  const clampedFrom = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
  const clampedTo = rangeFrom <= rangeTo ? rangeTo : rangeFrom;

  const [allDays, expenses, expenseCategories, paymentMethods] = await Promise.all([
    getBusinessDaysBetween(clampedFrom, clampedTo),
    getExpensesBetween(clampedFrom, clampedTo),
    getAllCategories("expense"),
    getPaymentMethods(),
  ]);

  const dates = enumerateDates(clampedFrom, clampedTo);
  const rawNightDayByDate = new Map(
    allDays.map((d) => [String(d.date), toRawNightDay(d as Record<string, unknown>)]),
  );
  const standaloneExpensesByDate = new Map<string, number>();
  for (const e of expenses) {
    if (e.linkedBusinessDayId !== null) continue;
    const d = String(e.date);
    standaloneExpensesByDate.set(d, (standaloneExpensesByDate.get(d) ?? 0) + e.amountSen);
  }

  const rows = dates.map((date) =>
    buildDailyRow(
      date,
      rawNightDayByDate.get(date) ?? null,
      standaloneExpensesByDate.get(date) ?? 0,
      settings.roomsAvailable,
    ),
  );
  const totals = dailyBreakdownTotals(rows);

  let csv = "";
  csv += row(
    "Date", "Rooms sold", "Rooms available", "Occupancy %", "Total revenue (RM)",
    "Cash (RM)", "DuitNow/transfer/QR (RM)", "Card (RM)", "E-wallet (RM)",
    "OTA receivable (RM)", "Expenses (RM)", "Cash variance (RM)", "Status",
  );
  for (const r of rows) {
    csv += row(
      r.date,
      String(r.roomsSold),
      String(r.roomsAvailable),
      r.occupancyRatio !== null ? String(Math.round(r.occupancyRatio * 100)) : "",
      fromSen(r.totalRevenueSen),
      fromSen(r.cashSen),
      fromSen(r.transferSen),
      fromSen(r.cardSen),
      fromSen(r.ewalletSen),
      fromSen(r.otaReceivableSen),
      fromSen(r.expensesSen),
      r.varianceSen !== null ? fromSen(r.varianceSen) : "",
      STATUS_LABEL[r.status] ?? r.status,
    );
  }
  csv += row(
    "Total",
    String(totals.roomsSold),
    String(totals.roomsAvailable),
    totals.occupancyRatio !== null ? String(Math.round(totals.occupancyRatio * 100)) : "",
    fromSen(totals.totalRevenueSen),
    fromSen(totals.cashSen),
    fromSen(totals.transferSen),
    fromSen(totals.cardSen),
    fromSen(totals.ewalletSen),
    fromSen(totals.otaReceivableSen),
    fromSen(totals.expensesSen),
    fromSen(totals.varianceSen),
    totals.missingCount > 0 ? `${totals.missingCount} missing` : "",
  );

  // ---- Itemised expenses — a clearly separated block, day-grouped with
  // subtotals, same shape as the on-screen list and the PDF. ----

  const categoryNameById = new Map(expenseCategories.map((c) => [c._id.toString(), c.name]));
  const paymentMethodNameById = new Map(paymentMethods.map((m) => [m._id.toString(), m.name]));
  const submitterIds = allDays
    .map((d) => (d as Record<string, unknown>).submittedBy)
    .filter((v): v is string => typeof v === "string");
  const recorderIds = expenses.map((e) => e.paidBy);
  const userNameById = await getUserNamesByIds([...submitterIds, ...recorderIds]);

  const nightLedgerLines = allDays.flatMap((d) => {
    const raw = d as Record<string, unknown>;
    const date = String(raw.date);
    const submittedBy = typeof raw.submittedBy === "string" ? raw.submittedBy : "";
    const dayExpenses = (raw.expenses as RawNightDay["expenses"]) ?? [];
    return buildNightExpenseLedgerLines(date, dayExpenses, userNameById.get(submittedBy) ?? "Unknown");
  });
  const standaloneLedgerLines = buildStandaloneExpenseLedgerLines(
    expenses,
    categoryNameById,
    paymentMethodNameById,
    userNameById,
  );
  const ledgerLines = [...nightLedgerLines, ...standaloneLedgerLines];

  csv += row("");
  csv += row("Itemised expenses");
  csv += row(
    "Date", "Category", "Description / note", "Paid to", "Payment method",
    "Amount (RM)", "Capital or operating", "Source", "Entered by",
  );
  for (const group of groupExpenseLedgerByDate(ledgerLines, "desc")) {
    for (const l of group.lines) {
      csv += row(
        l.date,
        l.category,
        l.note,
        l.paidTo,
        l.paymentMethod,
        fromSen(l.amountSen),
        l.capitalOrOperating === "capital" ? "Capital" : "Operating",
        l.source === "night" ? "Night report" : "Standalone",
        l.enteredBy,
      );
    }
    csv += row(`Subtotal for ${group.date}`, "", "", "", "", fromSen(group.subtotalSen), "", "", "");
  }
  csv += row("Grand total", "", "", "", "", fromSen(ledgerGrandTotalSen(ledgerLines)), "", "", "");

  const filename = `daily-breakdown-${clampedFrom}-to-${clampedTo}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
