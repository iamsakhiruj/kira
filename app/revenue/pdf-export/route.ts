import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import { getRevenueEntriesBetween } from "@/lib/revenueEntriesStore";
import { getBusinessDaysBetween } from "@/lib/businessDays";
import { totalRevenueSen } from "@/lib/nightReport";
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

// PDF export — manager+ only, same tier as /revenue itself.
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

  const [entries, categories, paymentMethods, businessDays, company] = await Promise.all([
    getRevenueEntriesBetween(clampedFrom, clampedTo),
    getAllCategories("revenue"),
    getPaymentMethods(),
    getBusinessDaysBetween(clampedFrom, clampedTo),
    getCompanyDetails(),
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

  // StandaloneLedgerPdf is a plain, hookless function component — calling it
  // directly returns the <Document> element renderToBuffer expects.
  const buffer = await renderToBuffer(
    StandaloneLedgerPdf({
      company,
      pageTitle: "Revenue",
      periodLabel: rangeLabel(clampedFrom, clampedTo),
      generatedAtLabel: `${KL_DATETIME.format(new Date())} (KL time)`,
      generatedByName: user.name,
      totalSen: standaloneTotalSen,
      entryCount: lines.length,
      channelSummary: standaloneChannelSummary(lines),
      extraSummaryLines: [
        { label: "Front desk (night reports)", amountSen: frontDeskRevenueSen },
        { label: "Standalone (this page)", amountSen: standaloneTotalSen },
      ],
      counterpartyLabel: "Received from",
      lines,
    }),
  );

  const filename = `revenue-${clampedFrom}-to-${clampedTo}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
