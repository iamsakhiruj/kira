import { requireUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getBusinessDaysBetween } from "@/lib/businessDays";
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
  type NightDayDoc,
  type StandaloneEntry,
} from "@/lib/reportSummary";
import ReportsPicker from "./reports-view";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Horizontal bar chart
// ---------------------------------------------------------------------------

function HBar({
  name,
  amountSen,
  maxSen,
}: {
  name: string;
  amountSen: number;
  maxSen: number;
}) {
  const pct = maxSen > 0 ? Math.round((amountSen / maxSen) * 100) : 0;
  return (
    <div className="flex items-center gap-2" style={{ fontSize: "var(--text-label)" }}>
      <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, background: "var(--page)", borderRadius: 4, height: 20 }}>
        <div
          style={{ width: `${pct}%`, background: "var(--brand-tint)", height: 20, borderRadius: 4 }}
        />
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
  const expenses = (doc.expenses as NightDayDoc["expenses"]) ?? [];
  const collections = (doc.collections as NightDayDoc["collections"]) ?? {
    cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0, otaPrepaidSen: 0,
    chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0,
  };
  const cash = (doc.cash as NightDayDoc["cash"]) ?? {
    openingFloatSen: 0, bankedInSen: 0, countedSen: 0,
  };
  return {
    rooms,
    revenueLines,
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
 * Returns the last calendar day of a YYYY-MM-DD string's month as a
 * YYYY-MM-DD string. Used to default "to" when only "from" is given and to
 * compute the "this month" preset on the server.
 */
function lastDayOfMonthStr(yearStr: string, monthStr: string): string {
  const y = Number(yearStr);
  const m = Number(monthStr);
  // Day 0 of next month = last day of this month
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearStr}-${monthStr}-${String(last).padStart(2, "0")}`;
}

/**
 * "This month" defaults: first … last day of the KL business-date's month.
 */
function thisMonthRange(today: string): { from: string; to: string } {
  const [y, m] = today.split("-");
  return {
    from: `${y}-${m}-01`,
    to: lastDayOfMonthStr(y, m),
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

/** Format a date range label for the page subtitle. */
function rangeLabel(from: string, to: string): string {
  if (from === to) return from;
  return `${from} – ${to}`;
}

// ---------------------------------------------------------------------------
// Presets — server computes the canonical values so the client picker has
// correct initial state without re-deriving dates.
// ---------------------------------------------------------------------------

type Preset = "this_month" | "last_month" | "this_year" | "custom";

function detectPreset(from: string, to: string, today: string): Preset {
  const tm = thisMonthRange(today);
  if (from === tm.from && to === tm.to) return "this_month";

  // Last month
  const [ty, tm2] = today.split("-").map(Number);
  const prevM = tm2 === 1 ? 12 : tm2 - 1;
  const prevY = tm2 === 1 ? ty - 1 : ty;
  const prevMonthFrom = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const prevMonthTo = lastDayOfMonthStr(String(prevY), String(prevM).padStart(2, "0"));
  if (from === prevMonthFrom && to === prevMonthTo) return "last_month";

  // This year
  const [ys] = today.split("-");
  if (from === `${ys}-01-01` && to === today) return "this_year";

  return "custom";
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
              My Reports
            </h1>
            <p style={{ color: "var(--text-muted)" }}>{rangeLabel(clampedFrom, clampedTo)}</p>
          </div>
          <ReportsPicker
            initialFrom={clampedFrom}
            initialTo={clampedTo}
            initialPreset={preset}
          />
        </div>

        {myDays.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>
            No reports submitted for this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ fontSize: "var(--text-label)" }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-strong)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-right">Revenue</th>
                  <th className="p-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {myDays.map((d) => {
                  const nd = toNightDayDoc(d as Record<string, unknown>);
                  const revTotal =
                    nd.rooms.revenueSen +
                    nd.revenueLines.reduce((s, l) => s + l.amountSen, 0);
                  const variance = nd.varianceSen ?? 0;
                  const overThreshold =
                    Math.abs(variance) > settings.varianceThresholdSen;
                  return (
                    <tr key={String(d._id)} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-2">{String(d.date)}</td>
                      <td className="p-2" style={{ color: "var(--text-muted)" }}>
                        {String(d.status)}
                      </td>
                      <td className="p-2 money">RM {fromSen(revTotal)}</td>
                      <td
                        className="p-2 money"
                        style={overThreshold ? { color: "var(--warn)" } : undefined}
                      >
                        {variance >= 0 ? "" : "−"}RM {fromSen(Math.abs(variance))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

  const revSummary = revenueBySource(nightDays, standaloneRevenue, categoryNameById);
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

  // Single-month detection for "Allocate this month" link (owner only)
  const exactMonth = isOwner ? isExactCalendarMonth(clampedFrom, clampedTo) : null;

  const preset = detectPreset(clampedFrom, clampedTo, today);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
            Reports
          </h1>
          <p style={{ color: "var(--text-muted)" }}>{rangeLabel(clampedFrom, clampedTo)}</p>
        </div>
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
      </div>

      {/* Summary cards */}
      <div
        className={`grid min-w-0 grid-cols-1 gap-3 ${isOwner ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <div
          className="flex flex-col gap-1 rounded-card border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Revenue
          </span>
          <span className="money" style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}>
            RM {fromSen(revSummary.totalSen)}
          </span>
        </div>
        <div
          className="flex flex-col gap-1 rounded-card border p-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Expenses
          </span>
          <span className="money" style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}>
            RM {fromSen(expSummary.totalSen)}
          </span>
        </div>
        {/* Net profit card — owner only */}
        {isOwner && profitSen !== null ? (
          <div
            className="flex flex-col gap-1 rounded-card border p-4"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Net profit
            </span>
            <span
              className={`money ${profitSen < 0 ? "money-out" : ""}`}
              style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}
            >
              {profitSen < 0 ? "−" : ""}RM {fromSen(Math.abs(profitSen))}
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
          </div>
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
              { label: "Rooms sold", value: String(occ.soldTotal) },
              { label: "Occupancy", value: `${Math.round(occ.occupancyRatio * 100)}%` },
              { label: "ADR", value: `RM ${fromSen(occ.adrSen)}` },
              { label: "RevPAR", value: `RM ${fromSen(occ.revparSen)}` },
              { label: "Room revenue", value: `RM ${fromSen(occ.roomRevenueSen)}` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-1 rounded-card border p-4"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                  {label}
                </span>
                <span
                  className="money"
                  style={{ fontSize: "var(--text-section)", fontWeight: 600 }}
                >
                  {value}
                </span>
              </div>
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
              />
            ))}
          </div>
        )}
      </section>

      {/* Cash movement */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Cash movement</h2>
        <div
          className="flex flex-col gap-0 rounded-card border"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            fontSize: "var(--text-label)",
          }}
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
        </div>
      </section>

      {/* Cash variance log */}
      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Cash variance log</h2>
        {varianceDays.length === 0 ? (
          <p style={{ color: "var(--text-faint)" }}>No variance records for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-strong)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-right">Variance</th>
                  <th className="p-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {varianceDays.map((v) => {
                  const over = Math.abs(v.varianceSen) > settings.varianceThresholdSen;
                  return (
                    <tr key={v.date} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="p-2">{v.date}</td>
                      <td
                        className="p-2 money"
                        style={over ? { color: "var(--warn)" } : undefined}
                      >
                        {v.varianceSen < 0 ? "−" : ""}RM {fromSen(Math.abs(v.varianceSen))}
                      </td>
                      <td className="p-2" style={{ color: "var(--text-muted)" }}>
                        {v.reason || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
