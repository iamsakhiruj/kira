import Counter from "@/components/animated/counter";
import GrowBar from "@/components/animated/grow-bar";
import PageHeader from "@/components/ui/page-header";
import StatTile from "@/components/ui/stat-tile";
import Card from "@/components/ui/card";
import DataTable from "@/components/ui/data-table";
import { requireUser } from "@/lib/auth";
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
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getPartnerTransactionsBetween } from "@/lib/partnersStore";
import { fromSen } from "@/lib/money";
import {
  revenueBySource,
  expensesByCategory,
  netProfitSen,
  cashMovement,
  collectionsByChannel,
  occupancy,
  lateSubmissionCount,
  guestsByNationality,
  cancellationSummary,
  type NightDayDoc,
  type StandaloneEntry,
} from "@/lib/reportSummary";
import ReportsPicker from "./reports-view";
import { lastDayOfMonthStr, thisMonthRange, detectPreset, rangeLabel } from "@/lib/dateRangePresets";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Horizontal bar chart
// ---------------------------------------------------------------------------

function HBar({
  name,
  amountSen,
  maxSen,
  tone = "neutral",
}: {
  name: string;
  amountSen: number;
  maxSen: number;
  tone?: "revenue" | "expense" | "neutral";
}) {
  const pct = maxSen > 0 ? Math.round((amountSen / maxSen) * 100) : 0;
  return (
    <div className="flex items-center gap-2" style={{ fontSize: "var(--text-label)" }}>
      <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>{name}</span>
      <div className="bar-track" style={{ flex: 1, height: 20 }}>
        <GrowBar pct={pct} className={`bar-fill bar-fill-${tone}`} style={{ height: 20 }} />
      </div>
      <span className="money" style={{ width: 110, flexShrink: 0 }}>
        RM {fromSen(amountSen)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
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
  return {
    rooms,
    revenueLines,
    otaBookings,
    expenses,
    collections,
    cash,
    varianceSen: typeof doc.varianceSen === "number" ? doc.varianceSen : undefined,
    varianceReason: typeof doc.varianceReason === "string" ? doc.varianceReason : undefined,
    date: typeof doc.date === "string" ? doc.date : undefined,
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

/**
 * Whether the given range is exactly one full calendar month
 * (from === YYYY-MM-01 AND to === last day of that same month).
 * Used to show the "Allocate this month" link for owners.
 */
function isExactCalendarMonth(from: string, to: string): string | null {
  const fromMatch = /^(\d{4})-(\d{2})-01$/.exec(from);
  if (!fromMatch) return null;
  const expected = lastDayOfMonthStr(fromMatch[1], fromMatch[2]);
  if (to !== expected) return null;
  return `${fromMatch[1]}-${fromMatch[2]}`; // YYYY-MM
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
  const isManagerOrAbove = isAuthorized(user.role, "manager");

  // ---------------------------------------------------------------------------
  // Reception: their own submitted night reports only — no aggregates.
  // Server-side filter: submittedBy === user.sub. No profit, no CSV.
  // ---------------------------------------------------------------------------

  if (isReception) {
    const allDays = await getBusinessDaysBetween(clampedFrom, clampedTo);
    const myDays = allDays.filter(
      (d) => String(d.submittedBy) === user.sub,
    );

    const preset = detectPreset(clampedFrom, clampedTo, today);

    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="My Reports"
          description={rangeLabel(clampedFrom, clampedTo)}
          action={
            <ReportsPicker
              initialFrom={clampedFrom}
              initialTo={clampedTo}
              initialPreset={preset}
            />
          }
          animate
        />

        <DataTable
          animate
          columns={[
            { key: "date", header: "Date" },
            { key: "status", header: "Status" },
            { key: "revenue", header: "Revenue", align: "right" },
            { key: "variance", header: "Variance", align: "right" },
          ]}
          isEmpty={myDays.length === 0}
          emptyMessage="No reports submitted for this period."
        >
          {myDays.map((d) => {
            const nd = toNightDayDoc(d as Record<string, unknown>);
            const revTotal =
              nd.rooms.revenueSen +
              nd.revenueLines.reduce((s, l) => s + l.amountSen, 0);
            const variance = nd.varianceSen ?? 0;
            const overThreshold =
              Math.abs(variance) > settings.varianceThresholdSen;
            return (
              <tr
                key={String(d._id)}
                className="table-row-hover"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-4 py-3">{String(d.date)}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                  {String(d.status)}
                </td>
                <td className="px-4 py-3 money text-right">RM {fromSen(revTotal)}</td>
                <td
                  className="px-4 py-3 money text-right"
                  style={overThreshold ? { color: "var(--warn)" } : undefined}
                >
                  {variance >= 0 ? "" : "−"}RM {fromSen(Math.abs(variance))}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Manager / Owner: full aggregated date-range view.
  // ---------------------------------------------------------------------------

  const [
    allDays,
    revenueEntries,
    expenses,
    revCats,
    expCats,
    paymentMethods,
    partnerTxns,
    bookingAccrual,
    arrivingBookings,
    cancelledBookings,
  ] = await Promise.all([
    getBusinessDaysBetween(clampedFrom, clampedTo),
    getRevenueEntriesBetween(clampedFrom, clampedTo),
    getExpensesBetween(clampedFrom, clampedTo),
    getAllCategories("revenue"),
    getAllCategories("expense"),
    getPaymentMethods(),
    isManagerOrAbove
      ? getPartnerTransactionsBetween(clampedFrom, clampedTo)
      : Promise.resolve([]),
    // Booking room revenue + tourism tax whose nights fall in the range
    // (bookings brief §4). Room revenue joins the revenue total as its own
    // source; tourism tax is a liability shown separately, never in revenue.
    sumBookingNightsBetween(clampedFrom, clampedTo),
    // Bookings arriving in the range, for the guests-by-nationality breakdown.
    getBookingsByCheckInBetween(clampedFrom, clampedTo),
    // Bookings cancelled / no-show in the range, for the cancellations report.
    getBookingsCancelledBetween(clampedFrom, clampedTo),
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
  const paymentMethodTypeById = new Map(paymentMethods.map((m) => [m._id.toString(), m.type]));

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

  const revSummary = revenueBySource(
    nightDays,
    standaloneRevenue,
    categoryNameById,
    bookingAccrual.roomRevenueSen,
    cancellations.depositsForfeitedSen,
  );

  const nationalities = guestsByNationality(
    arrivingBookings.map((b) => ({
      nationality: String(b.nationality ?? ""),
      status: String(b.status ?? ""),
    })),
  );
  const expSummary = expensesByCategory(nightDays, standaloneExpenses, categoryNameById);

  // Net profit — owner only (rule: manager must not see it)
  const profitSen = isOwner ? netProfitSen(revSummary.totalSen, expSummary.totalSen) : null;

  // Cash movement
  const openingFloat = nightDays.length > 0 ? (nightDays[0].cash.openingFloatSen ?? 0) : 0;
  const rangeDrawings = partnerTxns
    .filter((t) => String(t.direction) === "drawing")
    .map((t) => ({ direction: "drawing" as const, amountSen: t.amountSen as number }));
  const rangeInjections = partnerTxns
    .filter((t) => String(t.direction) === "injection")
    .map((t) => ({ direction: "injection" as const, amountSen: t.amountSen as number }));

  const cashMov = cashMovement({
    openingFloatSen: openingFloat,
    nightDays,
    drawings: rangeDrawings,
    injections: rangeInjections,
  });

  const channels = collectionsByChannel(nightDays, standaloneRevenue, paymentMethodTypeById);
  const occ =
    settings.roomsAvailable != null ? occupancy(nightDays, settings.roomsAvailable) : null;

  // Cash variance log (only days that have a recorded variance)
  const varianceDays = nightDays
    .filter((d) => d.varianceSen !== undefined)
    .map((d) => ({
      date: d.date ?? "",
      varianceSen: d.varianceSen ?? 0,
      reason: d.varianceReason ?? "",
    }));

  // Late submissions — reports filed more than the configured threshold after
  // the business day ended. Uses the raw docs (date + submittedAt), not the
  // NightDayDoc projection, which drops submittedAt.
  const lateCount = lateSubmissionCount(
    allDays.map((d) => {
      const raw = (d as Record<string, unknown>).submittedAt;
      const submittedAt = raw ? new Date(raw as string | Date) : null;
      return {
        date: String(d.date),
        submittedAt:
          submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : null,
      };
    }),
    settings.cutoffHour,
    settings.lateSubmissionThresholdHours,
  );

  // Single-month detection for "Allocate this month" link (owner only)
  const exactMonth = isOwner ? isExactCalendarMonth(clampedFrom, clampedTo) : null;

  const preset = detectPreset(clampedFrom, clampedTo, today);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        title="Reports"
        description={rangeLabel(clampedFrom, clampedTo)}
        action={
          <div className="flex flex-wrap items-end gap-3">
            <ReportsPicker
              initialFrom={clampedFrom}
              initialTo={clampedTo}
              initialPreset={preset}
            />
            {/* CSV export — manager+ only */}
            <a
              href={`/reports/export?from=${clampedFrom}&to=${clampedTo}`}
              className="flex items-center rounded-card border px-4"
              style={{
                height: "var(--touch-target)",
                fontSize: "var(--text-label)",
                borderColor: "var(--border-strong)",
                color: "var(--brand)",
              }}
            >
              Export CSV
            </a>
          </div>
        }
        animate
      />

      {/* Summary cards */}
      <div
        className={`grid min-w-0 grid-cols-1 gap-3 ${isOwner ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <StatTile
          animate
          label="Revenue"
          value={revSummary.totalSen}
          tone="revenue"
          delayMs={0}
        />
        <StatTile
          animate
          label="Expenses"
          value={expSummary.totalSen}
          tone="expense"
          delayMs={40}
        />
        {/* Net profit card — owner only */}
        {isOwner && profitSen !== null ? (
          <Card tone="brand" animate delayMs={80} className="flex flex-col gap-1 p-4">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Net profit
            </span>
            <span
              className={`money ${profitSen < 0 ? "money-out" : ""}`}
              style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}
            >
              <Counter value={profitSen} variant="money" prefix="RM " />
            </span>
            {/* Allocate link — only when the range is exactly one calendar month */}
            {exactMonth ? (
              <a
                href={`/profit?month=${exactMonth}`}
                style={{ fontSize: "var(--text-caption)", color: "var(--brand)" }}
              >
                Allocate this month →
              </a>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* Revenue by source */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Revenue by source</h2>
        {revSummary.sources.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>No revenue data for this period.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {revSummary.sources.map((s) => (
              <HBar
                key={s.name}
                name={s.name}
                amountSen={s.amountSen}
                maxSen={revSummary.sources[0].amountSen}
                tone="revenue"
              />
            ))}
            <div
              className="flex items-center gap-2 border-t pt-2"
              style={{
                borderColor: "var(--border)",
                fontSize: "var(--text-label)",
                fontWeight: 600,
              }}
            >
              <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>Total</span>
              <div style={{ flex: 1 }} />
              <span className="money" style={{ width: 110, flexShrink: 0 }}>
                RM {fromSen(revSummary.totalSen)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Tourism tax collected — a liability to remit, never revenue (bookings
          brief §1). Only shown when there is some in the period. */}
      {bookingAccrual.tourismTaxSen > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Tourism tax collected
          </h2>
          <p style={{ fontSize: "var(--text-label)" }}>
            <span className="money" style={{ fontWeight: 600 }}>
              RM {fromSen(bookingAccrual.tourismTaxSen)}
            </span>{" "}
            <span style={{ color: "var(--text-muted)" }}>
              collected from bookings this period — a liability held on behalf of the
              government, to be remitted. Not counted in revenue.
            </span>
          </p>
        </section>
      ) : null}

      {/* Expenses by category */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Expenses by category</h2>
        {expSummary.categories.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>No expenses data for this period.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {expSummary.categories.map((c) => (
              <HBar
                key={c.name}
                name={c.name}
                amountSen={c.amountSen}
                maxSen={expSummary.categories[0].amountSen}
                tone="expense"
              />
            ))}
            <div
              className="flex items-center gap-2 border-t pt-2"
              style={{
                borderColor: "var(--border)",
                fontSize: "var(--text-label)",
                fontWeight: 600,
              }}
            >
              <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>Total</span>
              <div style={{ flex: 1 }} />
              <span className="money" style={{ width: 110, flexShrink: 0 }}>
                RM {fromSen(expSummary.totalSen)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Occupancy */}
      {occ !== null && occ.availableTotal > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Occupancy</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Rooms sold", value: occ.soldTotal, variant: "int" as const },
              { label: "Occupancy", value: Math.round(occ.occupancyRatio * 100), variant: "percent" as const },
              { label: "ADR", value: occ.adrSen, variant: "money" as const },
              { label: "RevPAR", value: occ.revparSen, variant: "money" as const },
              { label: "Room revenue", value: occ.roomRevenueSen, variant: "money" as const },
            ].map(({ label, value, variant }, i) => (
              <Card
                key={label}
                tone="neutral"
                animate
                delayMs={i * 40}
                className="flex flex-col gap-1 p-4"
              >
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                  {label}
                </span>
                <span
                  className="money"
                  style={{ fontSize: "var(--text-section)", fontWeight: 600 }}
                >
                  <Counter
                    value={value}
                    variant={variant}
                    prefix={variant === "money" ? "RM " : ""}
                    suffix={variant === "percent" ? "%" : ""}
                  />
                </span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Guests by nationality — which markets you actually serve. Counts one
          per booking arriving in the period, excluding cancelled/no-show. */}
      {nationalities.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Guests by nationality
          </h2>
          <div className="flex flex-col gap-2">
            {nationalities.map((n) => {
              const pct =
                nationalities[0].count > 0
                  ? Math.round((n.count / nationalities[0].count) * 100)
                  : 0;
              return (
                <div
                  key={n.code}
                  className="flex items-center gap-2"
                  style={{ fontSize: "var(--text-label)" }}
                >
                  <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>{n.name}</span>
                  <div className="bar-track" style={{ flex: 1, height: 20 }}>
                    <GrowBar pct={pct} className="bar-fill bar-fill-neutral" style={{ height: 20 }} />
                  </div>
                  <span className="money" style={{ width: 110, flexShrink: 0 }}>
                    {n.count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Cancellations & no-shows */}
      {cancellations.cancelledCount + cancellations.noShowCount > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Cancellations &amp; no-shows
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: "Cancelled",
                sub: `${cancellations.cancelledCount} booking${cancellations.cancelledCount === 1 ? "" : "s"}`,
                value: cancellations.cancelledValueSen,
              },
              {
                label: "No-shows",
                sub: `${cancellations.noShowCount} booking${cancellations.noShowCount === 1 ? "" : "s"}`,
                value: cancellations.noShowValueSen,
              },
              {
                label: "Deposits forfeited",
                sub: "recognised as revenue",
                value: cancellations.depositsForfeitedSen,
              },
            ].map(({ label, sub, value }, i) => (
              <Card key={label} tone="neutral" animate delayMs={i * 40} className="flex flex-col gap-1 p-4">
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                  {label}
                </span>
                <span className="money" style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
                  RM {fromSen(value)}
                </span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
                  {sub}
                </span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Collections by channel */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Collections by channel
        </h2>
        {channels.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>No collections data for this period.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {channels.map((c) => (
              <HBar
                key={c.channel}
                name={c.channel}
                amountSen={c.amountSen}
                maxSen={channels[0].amountSen}
                tone="revenue"
              />
            ))}
          </div>
        )}
      </section>

      {/* Cash movement */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Cash movement</h2>
        <Card
          tone="neutral"
          animate
          className="flex flex-col gap-0"
          style={{ fontSize: "var(--text-label)" }}
        >
          {[
            { label: "Opening float", value: cashMov.openingSen },
            { label: "Cash collections", value: cashMov.collectionsSen },
            { label: "Cash expenses", value: -cashMov.cashExpensesSen },
            { label: "Drawings", value: -cashMov.drawingsSen },
            { label: "Injections", value: cashMov.injectionsSen },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <span className={`money ${value < 0 ? "money-out" : ""}`}>
                {value < 0 ? "−" : ""}RM {fromSen(Math.abs(value))}
              </span>
            </div>
          ))}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ fontWeight: 600 }}
          >
            <span>Closing balance</span>
            <span className={`money ${cashMov.closingSen < 0 ? "money-out" : ""}`}>
              {cashMov.closingSen < 0 ? "−" : ""}RM {fromSen(Math.abs(cashMov.closingSen))}
            </span>
          </div>
        </Card>
      </section>

      {/* Cash variance log */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Cash variance log</h2>
        <DataTable
          columns={[
            { key: "date", header: "Date" },
            { key: "variance", header: "Variance", align: "right" },
            { key: "reason", header: "Reason" },
          ]}
          isEmpty={varianceDays.length === 0}
          emptyMessage="No variance records for this period."
        >
          {varianceDays.map((v) => {
            const over = Math.abs(v.varianceSen) > settings.varianceThresholdSen;
            return (
              <tr
                key={v.date}
                className="table-row-hover"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-4 py-3">{v.date}</td>
                <td
                  className="px-4 py-3 money text-right"
                  style={over ? { color: "var(--warn)" } : undefined}
                >
                  {v.varianceSen < 0 ? "−" : ""}RM {fromSen(Math.abs(v.varianceSen))}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                  {v.reason || "—"}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      {/* Late submissions — house rule is to file before the shift hands over */}
      <section className="flex flex-col gap-1">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Late submissions
        </h2>
        <p style={{ fontSize: "var(--text-label)" }}>
          <span
            className="money"
            style={{
              fontWeight: 600,
              color: lateCount > 0 ? "var(--warn)" : "var(--text)",
            }}
          >
            {lateCount}
          </span>{" "}
          <span style={{ color: "var(--text-muted)" }}>
            report{lateCount === 1 ? "" : "s"} filed more than{" "}
            {settings.lateSubmissionThresholdHours}h after the business day ended.
          </span>
        </p>
      </section>
    </div>
  );
}
