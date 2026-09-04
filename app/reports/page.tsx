import PageHeader from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { buildReportData, type ReportScope } from "@/lib/reportData";
import HeadlineCards from "./headline-cards";
import ChannelSummary from "./channel-summary";
import ReportTable from "./report-table";
import ExpenseBars from "./expense-bars";
import ExpenseLedger from "./expense-ledger";
import ReportsPicker from "./reports-view";
import { thisMonthRange, detectPreset, rangeLabel, lastDayOfMonthStr } from "@/lib/dateRangePresets";

export const dynamic = "force-dynamic";

/**
 * Whether the given range is exactly one full calendar month
 * (from === YYYY-MM-01 AND to === last day of that same month).
 * Used to show the "Allocate this month" link on the owner's net-profit card.
 */
function isExactCalendarMonth(from: string, to: string): string | null {
  const fromMatch = /^(\d{4})-(\d{2})-01$/.exec(from);
  if (!fromMatch) return null;
  const expected = lastDayOfMonthStr(fromMatch[1], fromMatch[2]);
  if (to !== expected) return null;
  return `${fromMatch[1]}-${fromMatch[2]}`; // YYYY-MM
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const settings = await getSettings();
  const params = await searchParams;

  // Server computes "today" from KL business date — never taken from client.
  const today = businessDateFor(new Date(), settings.cutoffHour);
  const defaultRange = thisMonthRange(today);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const rangeFrom =
    params.from && DATE_RE.test(params.from) ? params.from : defaultRange.from;
  const rangeTo =
    params.to && DATE_RE.test(params.to)
      ? params.to
      : params.from && DATE_RE.test(params.from)
      ? params.from
      : defaultRange.to;

  // Clamp so from <= to and neither is in the future.
  const clampedFrom = rangeFrom <= today ? rangeFrom : today;
  const clampedTo =
    rangeTo >= clampedFrom
      ? rangeTo <= today
        ? rangeTo
        : today
      : clampedFrom;

  const isOwner = user.role === "owner";
  const isReception = user.role === "reception";

  // Rule 7, enforced here, not by hiding UI: reception's report is built
  // from their own submitted business days only, and never touches the
  // manager+ standalone revenue/expenses/booking/cancellation data.
  const scope: ReportScope = isReception
    ? { submittedByUserId: user.sub, includeStandalone: false }
    : { includeStandalone: true };

  const data = await buildReportData(clampedFrom, clampedTo, scope);

  const exactMonth = isOwner ? isExactCalendarMonth(clampedFrom, clampedTo) : null;
  const preset = detectPreset(clampedFrom, clampedTo, today);

  // No CSV, no PDF, no jump to the full night report for reception — same
  // "own days only, nothing manager+" boundary as everywhere else on this
  // page (rule 7).
  const canExport = !isReception;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isReception ? "My Reports" : "Reports"}
        description={rangeLabel(clampedFrom, clampedTo)}
        action={
          <ReportsPicker
            initialFrom={clampedFrom}
            initialTo={clampedTo}
            initialPreset={preset}
            today={today}
          />
        }
        animate
      />

      {canExport ? (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/reports/pdf-export?from=${clampedFrom}&to=${clampedTo}`}
            className="flex items-center rounded-card border px-4"
            style={{
              height: "var(--touch-target)",
              fontSize: "var(--text-label)",
              borderColor: "var(--border-strong)",
              color: "var(--brand)",
            }}
          >
            Download PDF
          </a>
          <a
            href={`/reports/daily-export?from=${clampedFrom}&to=${clampedTo}`}
            className="flex items-center rounded-card border px-4"
            style={{
              height: "var(--touch-target)",
              fontSize: "var(--text-label)",
              borderColor: "var(--border-strong)",
              color: "var(--brand)",
            }}
          >
            Download CSV
          </a>
        </div>
      ) : null}

      <HeadlineCards
        headline={data.headline}
        previousHeadline={data.previousHeadline}
        isOwner={isOwner}
        exactMonth={exactMonth}
      />

      <ChannelSummary items={data.channelSummary} />

      <ReportTable
        mode={data.mode}
        dailyRows={data.dailyRows}
        monthlyRows={data.monthlyRows}
        totals={data.totals}
        details={data.details}
        dayCsvBasePath={canExport ? "/reports/day-export" : null}
        canOpenFullReport={canExport}
        varianceThresholdSen={settings.varianceThresholdSen}
      />

      <ExpenseBars categories={data.expenseCategories} />

      {/* Itemised expense list — manager+ only (rule 7). data.expenseLedger
          is null for a reception-scoped request: never fetched, so there's
          nothing here to accidentally show. */}
      {data.expenseLedger ? <ExpenseLedger lines={data.expenseLedger} /> : null}
    </div>
  );
}
