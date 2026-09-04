import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getRevenueEntriesBetween } from "@/lib/revenueEntriesStore";
import { getBusinessDaysBetween } from "@/lib/businessDays";
import { totalRevenueSen } from "@/lib/nightReport";
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

// CSV export — manager+ only, same tier as /revenue itself.
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

  const [entries, categories, paymentMethods, businessDays] = await Promise.all([
    getRevenueEntriesBetween(clampedFrom, clampedTo),
    getAllCategories("revenue"),
    getPaymentMethods(),
    getBusinessDaysBetween(clampedFrom, clampedTo),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const methodById = new Map(paymentMethods.map((m) => [m._id.toString(), m]));
  const userNameById = await getUserNamesByIds(entries.map((e) => e.recordedBy));

  const lines: StandaloneLedgerLine[] = entries.map((e) => ({
    id: e._id.toString(),
    date: e.date,
    category: categoryNameById.get(e.categoryId) ?? "Unknown",
    note: e.note ?? "",
    counterparty: e.receivedFrom ?? "",
    paymentMethod: methodById.get(e.paymentMethodId)?.name ?? "Unknown",
    paymentMethodType: methodById.get(e.paymentMethodId)?.type ?? "other",
    amountSen: e.amountSen,
    enteredBy: userNameById.get(e.recordedBy) ?? "Unknown",
  }));

  const frontDeskRevenueSen = businessDays.reduce((sum, d) => {
    const rooms = (d.rooms as { revenueSen?: number } | undefined) ?? {};
    const revenueLines = (d.revenueLines as { amountSen: number }[] | undefined) ?? [];
    return sum + totalRevenueSen(rooms.revenueSen ?? 0, revenueLines);
  }, 0);
  const standaloneTotalSen = standaloneLedgerGrandTotalSen(lines);

  let csv = "";
  csv += row("Period", `${clampedFrom} to ${clampedTo}`);
  csv += row("Front desk revenue (night reports)", fromSen(frontDeskRevenueSen));
  csv += row("Standalone revenue (this page)", fromSen(standaloneTotalSen));
  csv += row("");
  csv += row("Date", "Category", "Description", "Received from", "Payment method", "Amount (RM)", "Entered by");
  for (const group of groupStandaloneLedgerByDate(lines, "desc")) {
    for (const l of group.lines) {
      csv += row(l.date, l.category, l.note, l.counterparty, l.paymentMethod, fromSen(l.amountSen), l.enteredBy);
    }
    csv += row(`Subtotal for ${group.date}`, "", "", "", "", fromSen(group.subtotalSen), "");
  }
  csv += row("Grand total (standalone)", "", "", "", "", fromSen(standaloneTotalSen), "");

  const filename = `revenue-${clampedFrom}-to-${clampedTo}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
