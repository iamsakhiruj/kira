"use client";

import { Fragment, useState } from "react";
import DataTable from "@/components/ui/data-table";
import Badge from "@/components/ui/badge";
import { fromSen } from "@/lib/money";
import {
  DAILY_ROW_STATUS_LABEL,
  type DailyBreakdownRow,
  type MonthlyBreakdownRow,
  type DailyBreakdownTotals,
  type RevenueDetail,
  type ExpenseDetail,
} from "@/lib/dailyBreakdown";
import type { DailyBreakdownDetail } from "@/lib/reportData";

const STATUS_TONE: Record<DailyBreakdownRow["status"], "neutral" | "muted" | "warn"> = {
  submitted: "warn",
  approved: "neutral",
  queried: "warn",
  missing: "muted",
};

const COLUMN_COUNT = 12;

function money(sen: number): string {
  return `RM ${fromSen(sen)}`;
}

function signedMoney(sen: number): { text: string; negative: boolean } {
  return { text: `${sen < 0 ? "−" : ""}RM ${fromSen(Math.abs(sen))}`, negative: sen < 0 };
}

function Cell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      className="px-3 py-3 money text-right"
      style={muted ? { color: "var(--text-faint)" } : undefined}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Drill-down panel — Revenue / Expenses tabs for one day, as previously
// specified. Unchanged in shape from the earlier daily-breakdown build.
// ---------------------------------------------------------------------------

function RevenueTab({ detail }: { detail: RevenueDetail | null }) {
  if (!detail) {
    return (
      <p style={{ color: "var(--text-faint)", fontSize: "var(--text-label)" }}>
        No night report for this date.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Room revenue — direct
          </span>
          <span className="money" style={{ fontWeight: 600 }}>{money(detail.roomRevenueDirectSen)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Room revenue — OTA
          </span>
          <span className="money" style={{ fontWeight: 600 }}>{money(detail.roomRevenueOtaSen)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h4 style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Other revenue lines</h4>
        {detail.revenueLines.length === 0 ? (
          <p style={{ color: "var(--text-faint)", fontSize: "var(--text-label)" }}>None.</p>
        ) : (
          <table className="w-full" style={{ fontSize: "var(--text-label)" }}>
            <tbody>
              {detail.revenueLines.map((l, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2">{l.category}</td>
                  <td className="py-2" style={{ color: "var(--text-muted)" }}>{l.note || ""}</td>
                  <td className="py-2 money text-right">{money(l.amountSen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Collections by payment method</h4>
        <table className="w-full" style={{ fontSize: "var(--text-label)" }}>
          <tbody>
            {detail.collections.map((c) => (
              <tr key={c.label} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2">{c.label}</td>
                <td className="py-2 money text-right">{money(c.amountSen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <h4 style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>OTA bookings</h4>
        {detail.otaBookings.length === 0 ? (
          <p style={{ color: "var(--text-faint)", fontSize: "var(--text-label)" }}>
            No OTA bookings this night.
          </p>
        ) : (
          <table className="w-full" style={{ fontSize: "var(--text-label)" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="py-2 text-left">Platform</th>
                <th className="py-2 text-right">Bookings</th>
                <th className="py-2 text-right">Room revenue</th>
                <th className="py-2 text-left">Guest paid</th>
              </tr>
            </thead>
            <tbody>
              {detail.otaBookings.map((b, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2">{b.platformName}</td>
                  <td className="py-2 text-right">{b.bookingsCount}</td>
                  <td className="py-2 money text-right">{money(b.roomRevenueSen)}</td>
                  <td className="py-2">{b.guestPaidPlatform ? "Platform" : "Us"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="flex items-center justify-between border-t pt-2"
        style={{ borderColor: "var(--border-strong)", fontWeight: 600 }}
      >
        <span>Total revenue</span>
        <span className="money">{money(detail.totalSen)}</span>
      </div>
    </div>
  );
}

function ExpensesTab({ detail }: { detail: ExpenseDetail }) {
  if (detail.lines.length === 0) {
    return (
      <p style={{ color: "var(--text-faint)", fontSize: "var(--text-label)" }}>
        No expenses recorded for this date.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full" style={{ fontSize: "var(--text-label)" }}>
        <thead>
          <tr style={{ color: "var(--text-muted)" }}>
            <th className="py-2 text-left">Category</th>
            <th className="py-2 text-left">Payment method</th>
            <th className="py-2 text-left">Paid to</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td className="py-2">
                {l.category}{" "}
                {l.source === "standalone" ? <Badge tone="brand">Standalone</Badge> : null}
              </td>
              <td className="py-2">{l.paymentMethodLabel}</td>
              <td className="py-2">{l.paidTo}</td>
              <td className="py-2 money text-right">{money(l.amountSen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="flex items-center justify-between border-t pt-2"
        style={{ borderColor: "var(--border-strong)", fontWeight: 600 }}
      >
        <span>Total expenses</span>
        <span className="money">{money(detail.totalSen)}</span>
      </div>
    </div>
  );
}

function DrillDownPanel({
  row,
  detail,
  dayCsvBasePath,
  canOpenFullReport,
}: {
  row: DailyBreakdownRow;
  detail: DailyBreakdownDetail;
  dayCsvBasePath: string | null;
  canOpenFullReport: boolean;
}) {
  const [tab, setTab] = useState<"revenue" | "expenses">(detail.revenue ? "revenue" : "expenses");

  return (
    <div className="flex flex-col gap-4 p-4" style={{ background: "var(--page)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["revenue", "expenses"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded border px-3"
              style={{
                height: "var(--touch-target)",
                fontSize: "var(--text-label)",
                borderColor: tab === t ? "var(--brand)" : "var(--border-strong)",
                color: tab === t ? "var(--brand)" : "var(--text-muted)",
                background: tab === t ? "var(--brand-tint)" : "var(--surface)",
                fontWeight: tab === t ? 600 : undefined,
              }}
            >
              {t === "revenue" ? "Revenue" : "Expenses"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {dayCsvBasePath ? (
            <a
              href={`${dayCsvBasePath}?date=${row.date}&tab=${tab}`}
              style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
            >
              Export {tab === "revenue" ? "revenue" : "expenses"} CSV
            </a>
          ) : null}
          {canOpenFullReport && row.businessDayId ? (
            <a
              href={`/reception/edit/${row.businessDayId}`}
              style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
            >
              Open full night report →
            </a>
          ) : null}
        </div>
      </div>

      {tab === "revenue" ? (
        <RevenueTab detail={detail.revenue} />
      ) : (
        <ExpensesTab detail={detail.expenses} />
      )}
    </div>
  );
}

function DrillRow({
  row,
  detail,
  dayCsvBasePath,
  canOpenFullReport,
}: {
  row: DailyBreakdownRow;
  detail: DailyBreakdownDetail;
  dayCsvBasePath: string | null;
  canOpenFullReport: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td colSpan={COLUMN_COUNT} className="p-0">
        <DrillDownPanel
          row={row}
          detail={detail}
          dayCsvBasePath={dayCsvBasePath}
          canOpenFullReport={canOpenFullReport}
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Day row — one calendar day. Used directly in daily mode, and nested under
// an expanded month row in monthly mode (via `indent`).
// ---------------------------------------------------------------------------

function DayRow({
  row,
  isExpanded,
  onClick,
  varianceThresholdSen,
  indent = false,
}: {
  row: DailyBreakdownRow;
  isExpanded: boolean;
  onClick: () => void;
  varianceThresholdSen: number;
  indent?: boolean;
}) {
  const variance = row.varianceSen !== null ? signedMoney(row.varianceSen) : null;
  const varianceOver = row.varianceSen !== null && Math.abs(row.varianceSen) > varianceThresholdSen;
  const missing = row.status === "missing";

  return (
    <tr
      className="table-row-hover"
      style={{
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        opacity: missing ? 0.7 : 1,
        background: indent ? "var(--page)" : undefined,
      }}
      onClick={onClick}
    >
      <td className="px-3 py-3" style={indent ? { paddingLeft: 28 } : undefined}>
        {isExpanded ? "▾ " : "▸ "}
        {row.label}
      </td>
      <Cell muted={missing}>{missing ? "—" : `${row.roomsSold} / ${row.roomsAvailable}`}</Cell>
      <Cell muted={missing}>
        {row.occupancyRatio !== null ? `${Math.round(row.occupancyRatio * 100)}%` : "—"}
      </Cell>
      <Cell muted={missing}>{money(row.totalRevenueSen)}</Cell>
      <Cell muted={missing}>{money(row.cashSen)}</Cell>
      <Cell muted={missing}>{money(row.transferSen)}</Cell>
      <Cell muted={missing}>{money(row.cardSen)}</Cell>
      <Cell muted={missing}>{money(row.ewalletSen)}</Cell>
      <Cell muted={missing}>{money(row.otaReceivableSen)}</Cell>
      <Cell muted={missing}>{money(row.expensesSen)}</Cell>
      <td
        className="px-3 py-3 money text-right"
        style={varianceOver ? { color: "var(--warn)" } : undefined}
      >
        {variance ? variance.text : "—"}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={STATUS_TONE[row.status]} variant="solid">
            {DAILY_ROW_STATUS_LABEL[row.status]}
          </Badge>
          {row.backdated ? <Badge tone="warn">Backdated</Badge> : null}
          {row.selfApproved ? <Badge tone="warn">Self-approved</Badge> : null}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Month row — one calendar month, expandable to its days.
// ---------------------------------------------------------------------------

function MonthRow({
  month,
  isExpanded,
  onClick,
}: {
  month: MonthlyBreakdownRow;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const variance = signedMoney(month.varianceSen);
  return (
    <tr
      className="table-row-hover"
      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", fontWeight: 600 }}
      onClick={onClick}
    >
      <td className="px-3 py-3">
        {isExpanded ? "▾" : "▸"} {month.label}
      </td>
      <Cell>{`${month.roomsSold} / ${month.roomsAvailable}`}</Cell>
      <Cell>{month.occupancyRatio !== null ? `${Math.round(month.occupancyRatio * 100)}%` : "—"}</Cell>
      <Cell>{money(month.totalRevenueSen)}</Cell>
      <Cell>{money(month.cashSen)}</Cell>
      <Cell>{money(month.transferSen)}</Cell>
      <Cell>{money(month.cardSen)}</Cell>
      <Cell>{money(month.ewalletSen)}</Cell>
      <Cell>{money(month.otaReceivableSen)}</Cell>
      <Cell>{money(month.expensesSen)}</Cell>
      <td className="px-3 py-3 money text-right">{variance.text}</td>
      <td className="px-3 py-3">
        <Badge tone={month.missingCount > 0 ? "warn" : "neutral"} variant="solid">
          {month.missingCount > 0 ? `${month.missingCount} missing` : "All filed"}
        </Badge>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Totals row — always the whole range's totals, regardless of daily/monthly
// display grain.
// ---------------------------------------------------------------------------

function TotalsRow({ totals }: { totals: DailyBreakdownTotals }) {
  const variance = signedMoney(totals.varianceSen);
  return (
    <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-strong)" }}>
      <td className="px-3 py-3">Total</td>
      <Cell>{`${totals.roomsSold} / ${totals.roomsAvailable}`}</Cell>
      <Cell>{totals.occupancyRatio !== null ? `${Math.round(totals.occupancyRatio * 100)}%` : "—"}</Cell>
      <Cell>{money(totals.totalRevenueSen)}</Cell>
      <Cell>{money(totals.cashSen)}</Cell>
      <Cell>{money(totals.transferSen)}</Cell>
      <Cell>{money(totals.cardSen)}</Cell>
      <Cell>{money(totals.ewalletSen)}</Cell>
      <Cell>{money(totals.otaReceivableSen)}</Cell>
      <Cell>{money(totals.expensesSen)}</Cell>
      <td
        className="px-3 py-3 money text-right"
        style={variance.negative ? { color: "var(--warn)" } : undefined}
      >
        {variance.text}
      </td>
      <td className="px-3 py-3">{totals.missingCount > 0 ? `${totals.missingCount} missing` : "—"}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// The report table itself. Shape follows the range: `mode` decides whether
// each row is a day or a month — there is no separate daily/monthly
// component. A month row expands to its days (reusing the same DayRow);
// a day row — whether shown directly (daily mode) or nested under a month
// (monthly mode) — expands to the Revenue/Expenses drill-down.
// ---------------------------------------------------------------------------

export default function ReportTable({
  mode,
  dailyRows,
  monthlyRows,
  totals,
  details,
  dayCsvBasePath,
  canOpenFullReport,
  varianceThresholdSen,
}: {
  mode: "daily" | "monthly";
  /** Used directly in daily mode; used to build monthlyRows' nested days. */
  dailyRows: DailyBreakdownRow[];
  monthlyRows: MonthlyBreakdownRow[] | null;
  totals: DailyBreakdownTotals;
  details: Record<string, DailyBreakdownDetail>;
  dayCsvBasePath: string | null;
  canOpenFullReport: boolean;
  varianceThresholdSen: number;
}) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const orderedDailyRows = newestFirst ? [...dailyRows].reverse() : dailyRows;
  const orderedMonthlyRows = monthlyRows ? (newestFirst ? [...monthlyRows].reverse() : monthlyRows) : null;

  function toggleDate(date: string) {
    setExpandedDate((cur) => (cur === date ? null : date));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          {mode === "daily" ? "Daily breakdown" : "Monthly breakdown"}
        </h2>
        <button
          type="button"
          onClick={() => setNewestFirst((v) => !v)}
          className="rounded border px-3"
          style={{
            height: "var(--touch-target)",
            fontSize: "var(--text-label)",
            borderColor: "var(--border-strong)",
            color: "var(--text-muted)",
            background: "var(--surface)",
          }}
        >
          {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      <DataTable
        columns={[
          { key: "date", header: mode === "daily" ? "Date" : "Month" },
          { key: "rooms", header: "Rooms sold / avail.", align: "right" },
          { key: "occ", header: "Occ. %", align: "right" },
          { key: "revenue", header: "Total revenue", align: "right" },
          { key: "cash", header: "Cash", align: "right" },
          { key: "transfer", header: "DuitNow / QR", align: "right" },
          { key: "card", header: "Card", align: "right" },
          { key: "ewallet", header: "E-wallet", align: "right" },
          { key: "ota", header: "OTA receivable", align: "right" },
          { key: "expenses", header: "Expenses", align: "right" },
          { key: "variance", header: "Cash variance", align: "right" },
          { key: "status", header: mode === "daily" ? "Status" : "Reports" },
        ]}
        isEmpty={mode === "daily" ? dailyRows.length === 0 : (monthlyRows?.length ?? 0) === 0}
        emptyMessage="No days in this range."
      >
        {mode === "daily"
          ? orderedDailyRows.map((r) => {
              const isExpanded = expandedDate === r.date;
              const detail = details[r.date];
              return (
                <Fragment key={r.date}>
                  <DayRow
                    row={r}
                    isExpanded={isExpanded}
                    onClick={() => toggleDate(r.date)}
                    varianceThresholdSen={varianceThresholdSen}
                  />
                  {isExpanded && detail ? (
                    <DrillRow
                      row={r}
                      detail={detail}
                      dayCsvBasePath={dayCsvBasePath}
                      canOpenFullReport={canOpenFullReport}
                    />
                  ) : null}
                </Fragment>
              );
            })
          : orderedMonthlyRows!.map((m) => {
              const monthExpanded = expandedMonth === m.month;
              const orderedDayRows = newestFirst ? [...m.dayRows].reverse() : m.dayRows;
              return (
                <Fragment key={m.month}>
                  <MonthRow
                    month={m}
                    isExpanded={monthExpanded}
                    onClick={() => setExpandedMonth(monthExpanded ? null : m.month)}
                  />
                  {monthExpanded
                    ? orderedDayRows.map((r) => {
                        const isExpanded = expandedDate === r.date;
                        const detail = details[r.date];
                        return (
                          <Fragment key={r.date}>
                            <DayRow
                              row={r}
                              indent
                              isExpanded={isExpanded}
                              onClick={() => toggleDate(r.date)}
                              varianceThresholdSen={varianceThresholdSen}
                            />
                            {isExpanded && detail ? (
                              <DrillRow
                                row={r}
                                detail={detail}
                                dayCsvBasePath={dayCsvBasePath}
                                canOpenFullReport={canOpenFullReport}
                              />
                            ) : null}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              );
            })}
        <TotalsRow totals={totals} />
      </DataTable>
    </section>
  );
}
