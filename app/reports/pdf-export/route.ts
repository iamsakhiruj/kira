import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import { buildReportData } from "@/lib/reportData";
import { DAILY_ROW_STATUS_LABEL } from "@/lib/dailyBreakdown";
import { thisMonthRange, rangeLabel } from "@/lib/dateRangePresets";
import ReportPdf, { type PdfTableRow, type PdfTotalsRow } from "@/lib/pdf/reportDocument";

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

// PDF export — manager+ only, same tier as every other /reports export
// (reception has no export button and gets no server access either).
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

  const [data, company] = await Promise.all([
    buildReportData(clampedFrom, clampedTo, { includeStandalone: true }),
    getCompanyDetails(),
  ]);

  const rows: PdfTableRow[] =
    data.mode === "daily"
      ? data.dailyRows.map((r) => ({
          label: r.label,
          roomsSold: r.roomsSold,
          roomsAvailable: r.roomsAvailable,
          occupancyRatio: r.occupancyRatio,
          totalRevenueSen: r.totalRevenueSen,
          cashSen: r.cashSen,
          transferSen: r.transferSen,
          cardSen: r.cardSen,
          ewalletSen: r.ewalletSen,
          otaReceivableSen: r.otaReceivableSen,
          expensesSen: r.expensesSen,
          varianceSen: r.varianceSen,
          // Backdated/self-approved are internal review flags (see the
          // on-screen table's badges) — left off the printed document,
          // whose audience is external (bank, accountant, partner).
          statusText: DAILY_ROW_STATUS_LABEL[r.status],
        }))
      : data.monthlyRows!.map((m) => ({
          label: m.label,
          roomsSold: m.roomsSold,
          roomsAvailable: m.roomsAvailable,
          occupancyRatio: m.occupancyRatio,
          totalRevenueSen: m.totalRevenueSen,
          cashSen: m.cashSen,
          transferSen: m.transferSen,
          cardSen: m.cardSen,
          ewalletSen: m.ewalletSen,
          otaReceivableSen: m.otaReceivableSen,
          expensesSen: m.expensesSen,
          varianceSen: m.varianceSen,
          statusText: m.missingCount > 0 ? `${m.missingCount} missing` : "All filed",
        }));

  const totals: PdfTotalsRow = {
    roomsSold: data.totals.roomsSold,
    roomsAvailable: data.totals.roomsAvailable,
    occupancyRatio: data.totals.occupancyRatio,
    totalRevenueSen: data.totals.totalRevenueSen,
    cashSen: data.totals.cashSen,
    transferSen: data.totals.transferSen,
    cardSen: data.totals.cardSen,
    ewalletSen: data.totals.ewalletSen,
    otaReceivableSen: data.totals.otaReceivableSen,
    expensesSen: data.totals.expensesSen,
    varianceSen: data.totals.varianceSen,
    statusText: data.totals.missingCount > 0 ? `${data.totals.missingCount} missing` : "—",
  };

  // ReportPdf is a plain, hookless function component — calling it directly
  // returns the <Document> element renderToBuffer expects, typed correctly
  // (a JSX wrapper here would type as FunctionComponentElement<ReportPdfProps>,
  // which renderToBuffer's signature rejects).
  const buffer = await renderToBuffer(
    ReportPdf({
      company,
      reportTitle: "Business Report",
      periodLabel: rangeLabel(clampedFrom, clampedTo),
      mode: data.mode,
      rows,
      totals,
      headline: data.headline,
      previousHeadline: data.previousHeadline,
      channelSummary: data.channelSummary,
      expenseCategories: data.expenseCategories,
      // This route is manager+ only, so buildReportData was called with
      // includeStandalone: true and the ledger is always populated — the
      // fallback is just to keep the type honest, never expected to fire.
      expenseLedger: data.expenseLedger ?? [],
      isOwner: user.role === "owner",
      generatedAtLabel: `${KL_DATETIME.format(new Date())} (KL time)`,
      generatedByName: user.name,
    }),
  );

  const filename = `report-${clampedFrom}-to-${clampedTo}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
