import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getExpensesBetween } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getUserNamesByIds } from "@/lib/users";
import { thisMonthRange } from "@/lib/dateRangePresets";
import { csvRow as row } from "@/lib/csv";
import { fromSen } from "@/lib/money";
import {
  groupStandaloneLedgerByDate,
  standaloneLedgerGrandTotalSen,
  type StandaloneLedgerLine,
} from "@/lib/standaloneLedger";

export const dynamic = "force-dynamic";

// CSV export — manager+ only, same tier as /expenses itself.
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
  const defaultRange = thisMonthRange(today);
  const rangeFrom = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : defaultRange.from;
  const rangeTo = rawTo && DATE_RE.test(rawTo) ? rawTo : today;
  const clampedFrom = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
  const clampedTo = rangeFrom <= rangeTo ? rangeTo : rangeFrom;

  const [expenses, categories, paymentMethods] = await Promise.all([
    getExpensesBetween(clampedFrom, clampedTo),
    getAllCategories("expense"),
    getPaymentMethods(),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const methodById = new Map(paymentMethods.map((m) => [m._id.toString(), m]));
  const userNameById = await getUserNamesByIds(expenses.map((e) => e.paidBy));

  const lines: StandaloneLedgerLine[] = expenses.map((e) => ({
    id: e._id.toString(),
    date: e.date,
    category: categoryNameById.get(e.categoryId) ?? "Unknown",
    note: e.note ?? "",
    counterparty: e.paidTo ?? "",
    paymentMethod: methodById.get(e.paymentMethodId)?.name ?? "Unknown",
    paymentMethodType: methodById.get(e.paymentMethodId)?.type ?? "other",
    amountSen: e.amountSen,
    enteredBy: userNameById.get(e.paidBy) ?? "Unknown",
  }));

  let csv = "";
  csv += row("Period", `${clampedFrom} to ${clampedTo}`);
  csv += row("Date", "Category", "Description", "Paid to", "Payment method", "Amount (RM)", "Entered by");
  for (const group of groupStandaloneLedgerByDate(lines, "desc")) {
    for (const l of group.lines) {
      csv += row(l.date, l.category, l.note, l.counterparty, l.paymentMethod, fromSen(l.amountSen), l.enteredBy);
    }
    csv += row(`Subtotal for ${group.date}`, "", "", "", "", fromSen(group.subtotalSen), "");
  }
  csv += row("Grand total", "", "", "", "", fromSen(standaloneLedgerGrandTotalSen(lines)), "");

  const filename = `expenses-${clampedFrom}-to-${clampedTo}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
