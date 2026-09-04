"use client";

import { Fragment, useMemo, useState } from "react";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { fromSen, toSen, MoneyError } from "@/lib/money";
import { formatBusinessDateLabel } from "@/lib/businessDate";
import {
  filterExpenseLedgerLines,
  sortExpenseLedgerLines,
  groupExpenseLedgerByDate,
  ledgerGrandTotalSen,
  type ExpenseLedgerLine,
  type ExpenseLedgerSortKey,
  type SortDirection,
  type CapitalOrOperating,
} from "@/lib/expenseLedger";

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function money(sen: number): string {
  return `RM ${fromSen(sen)}`;
}

/** Parses a minimum-amount filter input to sen, or undefined when blank /
 * unparseable — an invalid filter value means "no filter", not an error, so
 * the list never blocks on a stray keystroke. */
function parseMinAmount(input: string): number | undefined {
  if (!input.trim()) return undefined;
  try {
    return toSen(input);
  } catch (err) {
    if (err instanceof MoneyError) return undefined;
    throw err;
  }
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: ExpenseLedgerSortKey;
  activeKey: ExpenseLedgerSortKey;
  direction: SortDirection;
  onClick: (key: ExpenseLedgerSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <th className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1"
        style={{
          color: active ? "var(--brand)" : "var(--text-muted)",
          fontWeight: active ? 600 : undefined,
        }}
      >
        {label}
        {active ? <span>{direction === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );
}

function LedgerRow({ line }: { line: ExpenseLedgerLine }) {
  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-3 py-2">{line.date}</td>
      <td className="px-3 py-2">{line.category}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
        {line.note || "—"}
      </td>
      <td className="px-3 py-2">{line.paidTo || "—"}</td>
      <td className="px-3 py-2">{line.paymentMethod}</td>
      <td className="px-3 py-2 money text-right">{money(line.amountSen)}</td>
      <td className="px-3 py-2" style={{ textTransform: "capitalize" }}>
        {line.capitalOrOperating}
      </td>
      <td className="px-3 py-2">
        {line.source === "standalone" ? (
          <Badge tone="brand">Standalone</Badge>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Night report</span>
        )}
      </td>
      <td className="px-3 py-2">{line.enteredBy}</td>
    </tr>
  );
}

const COLUMN_COUNT = 9;

export default function ExpenseLedger({ lines }: { lines: ExpenseLedgerLine[] }) {
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [capitalOrOperating, setCapitalOrOperating] = useState<CapitalOrOperating | "">("");
  const [minAmountInput, setMinAmountInput] = useState("");
  const [sortKey, setSortKey] = useState<ExpenseLedgerSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const categoryOptions = useMemo(
    () => Array.from(new Set(lines.map((l) => l.category))).sort((a, b) => a.localeCompare(b)),
    [lines],
  );
  const paymentMethodOptions = useMemo(
    () => Array.from(new Set(lines.map((l) => l.paymentMethod))).sort((a, b) => a.localeCompare(b)),
    [lines],
  );

  const minAmountSen = parseMinAmount(minAmountInput);
  const hasFilters = !!category || !!paymentMethod || !!capitalOrOperating || minAmountSen !== undefined;

  const filtered = useMemo(
    () =>
      filterExpenseLedgerLines(lines, {
        category: category || undefined,
        paymentMethod: paymentMethod || undefined,
        capitalOrOperating: capitalOrOperating || undefined,
        minAmountSen,
      }),
    [lines, category, paymentMethod, capitalOrOperating, minAmountSen],
  );

  const grandTotalSen = ledgerGrandTotalSen(filtered);

  function handleSort(key: ExpenseLedgerSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // A sensible first direction per column: newest/largest first, category A→Z.
    setSortDir(key === "category" ? "asc" : "desc");
  }

  function clearFilters() {
    setCategory("");
    setPaymentMethod("");
    setCapitalOrOperating("");
    setMinAmountInput("");
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Itemised expenses</h2>

      {/* Filters — optional and combinable */}
      <Card tone="neutral" className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Category</span>
          <select
            aria-label="Filter by category"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Payment method
          </span>
          <select
            aria-label="Filter by payment method"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="">All methods</option>
            {paymentMethodOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Capital or operating
          </span>
          <select
            aria-label="Filter by capital or operating"
            className="h-9 rounded border px-2"
            style={fieldStyle}
            value={capitalOrOperating}
            onChange={(e) => setCapitalOrOperating(e.target.value as CapitalOrOperating | "")}
          >
            <option value="">Both</option>
            <option value="capital">Capital</option>
            <option value="operating">Operating</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Minimum amount
          </span>
          <input
            aria-label="Minimum amount"
            inputMode="decimal"
            placeholder="0.00"
            className="money h-9 w-28 rounded border px-2"
            style={fieldStyle}
            value={minAmountInput}
            onChange={(e) => setMinAmountInput(e.target.value)}
          />
        </label>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            style={{ fontSize: "var(--text-label)", color: "var(--brand)", height: 36 }}
          >
            Clear filters
          </button>
        ) : null}
      </Card>

      <Card tone="neutral" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                <SortHeader label="Date" sortKey="date" activeKey={sortKey} direction={sortDir} onClick={handleSort} />
                <SortHeader
                  label="Category"
                  sortKey="category"
                  activeKey={sortKey}
                  direction={sortDir}
                  onClick={handleSort}
                />
                <th className="px-3 py-3 text-left">Description / note</th>
                <th className="px-3 py-3 text-left">Paid to</th>
                <th className="px-3 py-3 text-left">Payment method</th>
                <SortHeader
                  label="Amount"
                  sortKey="amount"
                  activeKey={sortKey}
                  direction={sortDir}
                  onClick={handleSort}
                  align="right"
                />
                <th className="px-3 py-3 text-left">Capital / operating</th>
                <th className="px-3 py-3 text-left">Source</th>
                <th className="px-3 py-3 text-left">Entered by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>
                    No expenses match these filters.
                  </td>
                </tr>
              ) : sortKey === "date" ? (
                groupExpenseLedgerByDate(filtered, sortDir).map((group) => (
                  <Fragment key={group.date}>
                    <tr style={{ background: "var(--page)" }}>
                      <td colSpan={5} className="px-3 py-2" style={{ fontWeight: 600 }}>
                        {formatBusinessDateLabel(group.date)}
                      </td>
                      <td className="px-3 py-2 money text-right" style={{ fontWeight: 600 }}>
                        {money(group.subtotalSen)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                    {group.lines.map((line, i) => (
                      <LedgerRow key={i} line={line} />
                    ))}
                  </Fragment>
                ))
              ) : (
                sortExpenseLedgerLines(filtered, sortKey, sortDir).map((line, i) => (
                  <LedgerRow key={i} line={line} />
                ))
              )}
            </tbody>
            {filtered.length > 0 ? (
              <tfoot>
                <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-strong)" }}>
                  <td colSpan={5} className="px-3 py-3">
                    Grand total
                  </td>
                  <td className="px-3 py-3 money text-right">{money(grandTotalSen)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
    </section>
  );
}
