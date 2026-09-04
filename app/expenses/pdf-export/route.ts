import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import { getExpensesBetween } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getUserNamesByIds } from "@/lib/users";
import { thisMonthRange, rangeLabel } from "@/lib/dateRangePresets";
import { standaloneChannelSummary, standaloneLedgerGrandTotalSen, type StandaloneLedgerLine } from "@/lib/standaloneLedger";
import StandaloneLedgerPdf from "@/lib/pdf/standaloneLedgerDocument";

export const dynamic = "force-dynamic";

const KL_DATETIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// PDF export — manager+ only, same tier as /expenses itself.
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

  const [expenses, categories, paymentMethods, company] = await Promise.all([
    getExpensesBetween(clampedFrom, clampedTo),
    getAllCategories("expense"),
    getPaymentMethods(),
    getCompanyDetails(),
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

  // StandaloneLedgerPdf is a plain, hookless function component — calling it
  // directly returns the <Document> element renderToBuffer expects (see
  // app/reports/pdf-export/route.ts for why a JSX wrapper types wrong here).
  const buffer = await renderToBuffer(
    StandaloneLedgerPdf({
      company,
      pageTitle: "Expenses",
      periodLabel: rangeLabel(clampedFrom, clampedTo),
      generatedAtLabel: `${KL_DATETIME.format(new Date())} (KL time)`,
      generatedByName: user.name,
      totalSen: standaloneLedgerGrandTotalSen(lines),
      entryCount: lines.length,
      channelSummary: standaloneChannelSummary(lines),
      counterpartyLabel: "Paid to",
      lines,
    }),
  );

  const filename = `expenses-${clampedFrom}-to-${clampedTo}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
