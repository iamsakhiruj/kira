"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRM } from "@/lib/money";
import { formatBp } from "@/lib/partners";
import { allocateMonth, lockMonth, adjustMonth } from "./actions";

interface Line {
  partnerId: string;
  partnerName: string;
  percentageBasisPoints: number;
  amountSen: number;
}
interface Allocation {
  id: string;
  month: string;
  netProfitSen: number;
  revenueSen: number;
  expenseSen: number;
  status: "draft" | "locked";
  isAdjustment: boolean;
  lockedAt: string | null;
  lines: Line[];
}
interface Profit {
  revenueSen: number;
  expenseSen: number;
  netProfitSen: number;
  dayCount: number;
  unapprovedDayCount: number;
}
interface HistoryRow {
  month: string;
  status: "draft" | "locked";
  netProfitSen: number;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

/** A management figure, never coloured green/red — it isn't a money-in/out
 * flow (design rule 2). Negative carries a minus sign so a loss is legible. */
function Figure({ sen, strong }: { sen: number; strong?: boolean }) {
  return (
    <span className="money" style={{ fontWeight: strong ? 600 : 400 }}>
      {formatRM(sen)}
    </span>
  );
}

function StatusBadge({ status }: { status: "draft" | "locked" }) {
  const locked = status === "locked";
  return (
    <span
      className="rounded px-2 py-0.5"
      style={{
        fontSize: "var(--text-caption)",
        color: locked ? "var(--text)" : "var(--text-muted)",
        border: "1px solid var(--border-strong)",
      }}
    >
      {locked ? "Locked" : "Draft"}
    </span>
  );
}

function AllocationCard({ alloc }: { alloc: Allocation }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = alloc.lines.reduce((s, l) => s + l.amountSen, 0);
  const totalBp = alloc.lines.reduce((s, l) => s + l.percentageBasisPoints, 0);

  async function lock() {
    setError(null);
    setPending(true);
    const res = await lockMonth(alloc.id);
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }
  async function adjust() {
    setError(null);
    setPending(true);
    const res = await adjustMonth(alloc.id);
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-card border p-4"
      style={{ borderColor: alloc.status === "locked" ? "var(--border-strong)" : "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            {alloc.isAdjustment ? "Adjustment" : "Allocation"}
          </h3>
          <StatusBadge status={alloc.status} />
          {alloc.lockedAt ? (
            <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
              locked {alloc.lockedAt}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {alloc.status === "draft" ? (
            <button type="button" disabled={pending} onClick={lock} style={{ color: "var(--brand)", fontWeight: 600 }}>
              {pending ? "…" : "Lock"}
            </button>
          ) : !alloc.isAdjustment ? (
            <button type="button" disabled={pending} onClick={adjust} style={{ color: "var(--text-muted)" }}>
              {pending ? "…" : "Adjust"}
            </button>
          ) : null}
        </div>
      </div>

      <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
            <th className="p-2 text-left">Partner</th>
            <th className="p-2 text-right">Share used</th>
            <th className="p-2 text-right">Notional amount</th>
          </tr>
        </thead>
        <tbody>
          {alloc.lines.map((l) => (
            <tr key={l.partnerId} style={{ borderBottom: "1px solid var(--border)" }}>
              <td className="p-2">{l.partnerName}</td>
              {/* The frozen percentage, shown on every line next to the amount:
                  once locked this is the split that month used, so a later share
                  change never makes an old month ambiguous. */}
              <td className="p-2 money">{formatBp(l.percentageBasisPoints)}%</td>
              <td className="p-2"><Figure sen={l.amountSen} /></td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid var(--border-strong)" }}>
            <td className="p-2" style={{ fontWeight: 600 }}>Total</td>
            <td className="p-2 money" style={{ color: totalBp === 10000 ? "var(--text-muted)" : "var(--warn)" }}>
              {formatBp(totalBp)}%
            </td>
            <td className="p-2"><Figure sen={total} strong /></td>
          </tr>
        </tbody>
      </table>

      {alloc.status === "draft" ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
          Draft — the shares above reflect the set in force at month-end and will be
          frozen onto this allocation when you lock it. Refresh to recompute from the
          latest figures.
        </p>
      ) : (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Locked — these percentages are frozen. Changing a partner&apos;s share later
          does not alter this month; a correction is a new adjustment.
        </p>
      )}
      {error ? <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p> : null}
    </div>
  );
}

export default function ProfitManager({
  month,
  profit,
  allocations,
  history,
}: {
  month: string;
  profit: Profit;
  allocations: Allocation[];
  history: HistoryRow[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseAllocation = allocations.find((a) => !a.isAdjustment);
  const hasLockedBase = baseAllocation?.status === "locked";

  async function allocate() {
    setError(null);
    setPending(true);
    const res = await allocateMonth(month);
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  function changeMonth(m: string) {
    if (/^\d{4}-\d{2}$/.test(m)) router.push(`/profit?month=${m}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sdn Bhd labelling: a management figure and a notional share, not a
          declared dividend. Kept prominent so nobody reads month-close as
          "money is due". */}
      <div
        className="rounded-card border p-3"
        style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}
      >
        <p style={{ fontSize: "var(--text-label)", color: "var(--text)" }}>
          <strong>This is a management figure, not a dividend.</strong> Locking a month
          records each partner&apos;s notional share of the period&apos;s profit for the
          books. It does <strong>not</strong> mean money is owed or payable. In a Sdn Bhd
          a dividend is a separate act — declared from post-tax profit, with the company
          secretary&apos;s paperwork — and is recorded as a partner transaction when it
          actually happens.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-card border p-3" style={fieldStyle}>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Month</span>
          <input
            type="month"
            className="h-11 rounded border px-3"
            style={fieldStyle}
            defaultValue={month}
            onChange={(e) => changeMonth(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={pending || hasLockedBase}
          onClick={allocate}
          className="h-11 rounded-card px-4 font-medium"
          style={{
            background: "var(--brand)",
            color: "var(--on-brand)",
            opacity: pending || hasLockedBase ? 0.5 : 1,
          }}
          title={hasLockedBase ? "This month is locked — use Adjust below" : undefined}
        >
          {pending ? "Working…" : baseAllocation ? "Refresh draft" : "Allocate this month"}
        </button>
        {error ? <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p> : null}
      </div>

      {/* The month's computed management profit — revenue less expenses,
          combining night reports with standalone entries. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-card border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Revenue</div>
          <div style={{ fontSize: "var(--text-section)" }}><Figure sen={profit.revenueSen} strong /></div>
        </div>
        <div className="rounded-card border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Expenses</div>
          <div style={{ fontSize: "var(--text-section)" }}><Figure sen={profit.expenseSen} strong /></div>
        </div>
        <div className="rounded-card border p-4" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          <div style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Net profit (management figure)
          </div>
          <div style={{ fontSize: "var(--text-section)" }}><Figure sen={profit.netProfitSen} strong /></div>
          {profit.netProfitSen < 0 ? (
            <div style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>
              A loss — notional shares below are negative.
            </div>
          ) : null}
        </div>
      </div>

      {profit.unapprovedDayCount > 0 ? (
        <p
          className="rounded-card px-3 py-2"
          style={{ background: "var(--warn-bg)", color: "var(--warn)", fontSize: "var(--text-label)" }}
        >
          {profit.unapprovedDayCount} of {profit.dayCount} night report
          {profit.dayCount === 1 ? "" : "s"} this month {profit.unapprovedDayCount === 1 ? "is" : "are"} not
          yet approved. The figure can still change until every day is approved — allocate a
          month only once its days are settled.
        </p>
      ) : null}

      {allocations.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No allocation for {month} yet. Allocate to produce a draft you can review and lock.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {allocations.map((a) => (
            <AllocationCard key={a.id} alloc={a} />
          ))}
        </div>
      )}

      {history.length ? (
        <section className="flex flex-col gap-2">
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>All months</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                  <th className="p-2 text-left">Month</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-right">Net profit</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.month} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="p-2">{h.month}</td>
                    <td className="p-2"><StatusBadge status={h.status} /></td>
                    <td className="p-2"><Figure sen={h.netProfitSen} /></td>
                    <td className="p-2 text-right">
                      <button type="button" onClick={() => changeMonth(h.month)} style={{ color: "var(--brand)" }}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
