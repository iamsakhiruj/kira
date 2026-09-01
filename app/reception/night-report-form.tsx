"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import {
  REVENUE_CATEGORIES,
  EXPENSE_CATEGORIES,
  PAID_BY,
  reconcile,
  requiresVarianceReason,
  occupancyRatio,
  adrSen,
  revparSen,
  totalRevenueSen,
} from "@/lib/nightReport";
import { submitNightReport } from "./actions";

type Amt = string; // raw user input, parsed to sen with lib/money

interface RevenueRow {
  id: number;
  category: (typeof REVENUE_CATEGORIES)[number];
  amount: Amt;
  note: string;
}
interface ExpenseRow {
  id: number;
  category: (typeof EXPENSE_CATEGORIES)[number];
  amount: Amt;
  paidTo: string;
  paidBy: (typeof PAID_BY)[number];
  note: string;
}
interface FormState {
  rooms: { available: string; sold: string; houseUse: string; revenue: Amt };
  revenueLines: RevenueRow[];
  collections: {
    cash: Amt;
    card: Amt;
    transfer: Amt;
    ewallet: Amt;
    otaPrepaid: Amt;
    chargeToAccount: Amt;
    deposits: Amt;
    refunds: Amt;
  };
  expenses: ExpenseRow[];
  cash: { openingFloat: Amt; bankedIn: Amt; counted: Amt };
  remarks: string;
  varianceReason: string;
}

interface Defaults {
  roomsAvailable: number | null;
  openingFloatSen: number | null;
}

function initialState(defaults: Defaults): FormState {
  return {
    rooms: {
      available:
        defaults.roomsAvailable != null ? String(defaults.roomsAvailable) : "",
      sold: "",
      houseUse: "",
      revenue: "",
    },
    revenueLines: [],
    collections: {
      cash: "",
      card: "",
      transfer: "",
      ewallet: "",
      otaPrepaid: "",
      chargeToAccount: "",
      deposits: "",
      refunds: "",
    },
    expenses: [],
    cash: {
      openingFloat:
        defaults.openingFloatSen != null
          ? fromSen(defaults.openingFloatSen)
          : "",
      bankedIn: "",
      counted: "",
    },
    remarks: "",
    varianceReason: "",
  };
}

/** Parse an amount field to sen. Empty is 0; invalid is null. */
function parseAmt(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    return toSen(s);
  } catch {
    return null;
  }
}
function sen(s: string): number {
  const v = parseAmt(s);
  return v === null ? 0 : v;
}
function parseCount(s: string): number {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function MoneyInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const invalid = parseAmt(value) === null;
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.00"
      className="money h-11 w-full rounded border px-3"
      style={{
        ...fieldStyle,
        borderColor: invalid ? "var(--warn)" : "var(--border-strong)",
      }}
    />
  );
}

function IntInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      placeholder="0"
      className="money h-11 w-full rounded border px-3"
      style={fieldStyle}
    />
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
      {children}
    </h2>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export default function NightReportForm({
  date,
  defaults,
  varianceThresholdSen,
}: {
  date: string;
  defaults: Defaults;
  varianceThresholdSen: number;
}) {
  const router = useRouter();
  const draftKey = `hbkl:nr:${date}`;
  const [state, setState] = useState<FormState>(() => initialState(defaults));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const nextId = useRef(1);

  // Load any locally saved draft (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setState(JSON.parse(raw) as FormState);
    } catch {
      // ignore a corrupt draft
    }
    loaded.current = true;
  }, [draftKey]);

  // Autosave so a dropped connection at 1am doesn't lose the entry.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(state));
    } catch {
      // storage full / unavailable — nothing we can do, keep going
    }
  }, [state, draftKey]);

  const derived = useMemo(() => {
    const available = parseCount(state.rooms.available);
    const sold = parseCount(state.rooms.sold);
    const roomRevenueSen = sen(state.rooms.revenue);
    const revenueLinesSen = state.revenueLines.map((l) => ({
      amountSen: sen(l.amount),
    }));
    const recon = reconcile({
      collections: {
        cashSen: sen(state.collections.cash),
        refundsSen: sen(state.collections.refunds),
      },
      expenses: state.expenses.map((e) => ({
        amountSen: sen(e.amount),
        paidBy: e.paidBy,
      })),
      cash: {
        openingFloatSen: sen(state.cash.openingFloat),
        bankedInSen: sen(state.cash.bankedIn),
        countedSen: sen(state.cash.counted),
      },
    });
    return {
      occupancy: occupancyRatio(sold, available),
      adr: adrSen(roomRevenueSen, sold),
      revpar: revparSen(roomRevenueSen, available),
      totalRevenueSen: totalRevenueSen(roomRevenueSen, revenueLinesSen),
      recon,
      reasonRequired: requiresVarianceReason(
        recon.varianceSen,
        varianceThresholdSen,
      ),
    };
  }, [state, varianceThresholdSen]);

  const set = (updater: (s: FormState) => FormState) =>
    setState((s) => updater(structuredClone(s)));

  function addRevenueLine() {
    set((s) => {
      s.revenueLines.push({
        id: nextId.current++,
        category: REVENUE_CATEGORIES[0],
        amount: "",
        note: "",
      });
      return s;
    });
  }
  function addExpense() {
    set((s) => {
      s.expenses.push({
        id: nextId.current++,
        category: EXPENSE_CATEGORIES[0],
        amount: "",
        paidTo: "",
        paidBy: "cash",
        note: "",
      });
      return s;
    });
  }

  async function handleSubmit() {
    setError(null);

    // Every amount must parse.
    const badAmount =
      parseAmt(state.rooms.revenue) === null ||
      Object.values(state.collections).some((v) => parseAmt(v) === null) ||
      Object.values(state.cash).some((v) => parseAmt(v) === null) ||
      state.revenueLines.some((l) => parseAmt(l.amount) === null) ||
      state.expenses.some((e) => parseAmt(e.amount) === null);
    if (badAmount) {
      setError("Some amounts aren't valid. Check the fields outlined in amber.");
      return;
    }

    const available = parseCount(state.rooms.available);
    const sold = parseCount(state.rooms.sold);
    const houseUse = parseCount(state.rooms.houseUse);
    if ([available, sold, houseUse].some((n) => Number.isNaN(n))) {
      setError("Room counts must be whole numbers.");
      return;
    }
    if (sold + houseUse > available) {
      setError("Rooms sold plus house use cannot exceed rooms available.");
      return;
    }
    if (derived.reasonRequired && !state.varianceReason.trim()) {
      setError(
        `The drawer is ${formatRM(Math.abs(derived.recon.varianceSen))} ${
          derived.recon.varianceSen < 0 ? "short" : "over"
        }. Enter a reason before submitting.`,
      );
      return;
    }

    const report = {
      rooms: {
        available,
        sold,
        houseUse,
        revenueSen: sen(state.rooms.revenue),
      },
      revenueLines: state.revenueLines.map((l) => ({
        category: l.category,
        amountSen: sen(l.amount),
        note: l.note,
      })),
      collections: {
        cashSen: sen(state.collections.cash),
        cardSen: sen(state.collections.card),
        transferSen: sen(state.collections.transfer),
        ewalletSen: sen(state.collections.ewallet),
        otaPrepaidSen: sen(state.collections.otaPrepaid),
        chargeToAccountSen: sen(state.collections.chargeToAccount),
        depositsSen: sen(state.collections.deposits),
        refundsSen: sen(state.collections.refunds),
      },
      expenses: state.expenses.map((e) => ({
        category: e.category,
        amountSen: sen(e.amount),
        paidTo: e.paidTo,
        paidBy: e.paidBy,
        note: e.note,
      })),
      cash: {
        openingFloatSen: sen(state.cash.openingFloat),
        bankedInSen: sen(state.cash.bankedIn),
        countedSen: sen(state.cash.counted),
      },
      remarks: state.remarks,
      varianceReason: state.varianceReason,
    };

    setPending(true);
    try {
      const res = await submitNightReport({ date, report });
      if (res.ok) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't submit — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const v = derived.recon.varianceSen;
  const varianceStyle: React.CSSProperties = derived.reasonRequired
    ? { color: "var(--warn)", background: "var(--warn-bg)" }
    : { color: "var(--text)" };

  return (
    <div className="flex flex-col gap-6 pb-40">
      {/* Rooms */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Rooms</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Rooms available">
            <IntInput
              ariaLabel="Rooms available"
              value={state.rooms.available}
              onChange={(x) => set((s) => ((s.rooms.available = x), s))}
            />
          </Row>
          <Row label="Rooms sold">
            <IntInput
              ariaLabel="Rooms sold"
              value={state.rooms.sold}
              onChange={(x) => set((s) => ((s.rooms.sold = x), s))}
            />
          </Row>
          <Row label="House use / comp">
            <IntInput
              ariaLabel="House use"
              value={state.rooms.houseUse}
              onChange={(x) => set((s) => ((s.rooms.houseUse = x), s))}
            />
          </Row>
          <Row label="Room revenue (RM)">
            <MoneyInput
              ariaLabel="Room revenue"
              value={state.rooms.revenue}
              onChange={(x) => set((s) => ((s.rooms.revenue = x), s))}
            />
          </Row>
        </div>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Occupancy {(derived.occupancy * 100).toFixed(0)}% · ADR{" "}
          {formatRM(derived.adr)} · RevPAR {formatRM(derived.revpar)}
        </p>
      </section>

      {/* Other revenue */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Other revenue</SectionHeading>
        {state.revenueLines.map((line, i) => (
          <div key={line.id} className="flex flex-col gap-2 rounded-card border p-3" style={fieldStyle}>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Revenue category"
                className="h-11 rounded border px-2"
                style={fieldStyle}
                value={line.category}
                onChange={(e) =>
                  set((s) => ((s.revenueLines[i].category = e.target.value as RevenueRow["category"]), s))
                }
              >
                {REVENUE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <MoneyInput
                ariaLabel="Revenue amount"
                value={line.amount}
                onChange={(x) => set((s) => ((s.revenueLines[i].amount = x), s))}
              />
            </div>
            <input
              aria-label="Revenue note"
              placeholder="Note (optional)"
              className="h-11 rounded border px-3"
              style={fieldStyle}
              value={line.note}
              onChange={(e) => set((s) => ((s.revenueLines[i].note = e.target.value), s))}
            />
            <button
              type="button"
              onClick={() => set((s) => ((s.revenueLines.splice(i, 1)), s))}
              style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRevenueLine}
          className="h-11 rounded-card border"
          style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
        >
          + Add revenue line
        </button>
      </section>

      {/* Collections */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Collections</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["cash", "Cash"],
              ["card", "Card terminal"],
              ["transfer", "DuitNow / transfer / QR"],
              ["ewallet", "E-wallet"],
              ["otaPrepaid", "OTA prepaid (receivable)"],
              ["chargeToAccount", "Charge to account (receivable)"],
              ["deposits", "Deposits received"],
              ["refunds", "Refunds paid out"],
            ] as const
          ).map(([key, label]) => (
            <Row key={key} label={label}>
              <MoneyInput
                ariaLabel={label}
                value={state.collections[key]}
                onChange={(x) => set((s) => ((s.collections[key] = x), s))}
              />
            </Row>
          ))}
        </div>
      </section>

      {/* Expenses */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Petty cash & kitchen</SectionHeading>
        {state.expenses.map((e, i) => (
          <div key={e.id} className="flex flex-col gap-2 rounded-card border p-3" style={fieldStyle}>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Expense category"
                className="h-11 rounded border px-2"
                style={fieldStyle}
                value={e.category}
                onChange={(ev) =>
                  set((s) => ((s.expenses[i].category = ev.target.value as ExpenseRow["category"]), s))
                }
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <MoneyInput
                ariaLabel="Expense amount"
                value={e.amount}
                onChange={(x) => set((s) => ((s.expenses[i].amount = x), s))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Paid to"
                placeholder="Paid to"
                className="h-11 rounded border px-3"
                style={fieldStyle}
                value={e.paidTo}
                onChange={(ev) => set((s) => ((s.expenses[i].paidTo = ev.target.value), s))}
              />
              <select
                aria-label="Paid by"
                className="h-11 rounded border px-2"
                style={fieldStyle}
                value={e.paidBy}
                onChange={(ev) => set((s) => ((s.expenses[i].paidBy = ev.target.value as ExpenseRow["paidBy"]), s))}
              >
                {PAID_BY.map((p) => (
                  <option key={p} value={p}>
                    {p === "cash" ? "Paid in cash" : "Paid by card"}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => set((s) => ((s.expenses.splice(i, 1)), s))}
              style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addExpense}
          className="h-11 rounded-card border"
          style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
        >
          + Add expense
        </button>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Only cash expenses affect the drawer. Card ones don&apos;t.
        </p>
      </section>

      {/* Cash reconciliation */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Cash count</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Row label="Opening float (RM)">
            <MoneyInput
              ariaLabel="Opening float"
              value={state.cash.openingFloat}
              onChange={(x) => set((s) => ((s.cash.openingFloat = x), s))}
            />
          </Row>
          <Row label="Banked in (RM)">
            <MoneyInput
              ariaLabel="Banked in"
              value={state.cash.bankedIn}
              onChange={(x) => set((s) => ((s.cash.bankedIn = x), s))}
            />
          </Row>
          <Row label="Cash counted (RM)">
            <MoneyInput
              ariaLabel="Cash counted"
              value={state.cash.counted}
              onChange={(x) => set((s) => ((s.cash.counted = x), s))}
            />
          </Row>
        </div>
        {derived.reasonRequired ? (
          <Row label="Reason for the variance (required)">
            <input
              aria-label="Variance reason"
              className="h-11 rounded border px-3"
              style={fieldStyle}
              value={state.varianceReason}
              onChange={(e) => set((s) => ((s.varianceReason = e.target.value), s))}
            />
          </Row>
        ) : null}
      </section>

      {/* Remarks */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Remarks</SectionHeading>
        <textarea
          aria-label="Remarks"
          rows={3}
          placeholder="Complaints, walk-ins turned away, maintenance — anything unusual."
          className="rounded-card border p-3"
          style={fieldStyle}
          value={state.remarks}
          onChange={(e) => set((s) => ((s.remarks = e.target.value), s))}
        />
      </section>

      {/* Sticky summary + submit */}
      <div
        className="fixed inset-x-0 bottom-0 border-t p-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-muted)" }}>Expected</span>
            <span className="money">{formatRM(derived.recon.expectedCashSen)}</span>
          </div>
          <div
            className="flex items-center justify-between rounded px-2 py-1"
            style={varianceStyle}
          >
            <span style={{ fontWeight: 600 }}>
              Variance{derived.reasonRequired ? " — out of tolerance" : ""}
            </span>
            <span className="money" style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}>
              {v > 0 ? "+" : ""}
              {formatRM(v)}
            </span>
          </div>
          {error ? (
            <p role="alert" style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="h-11 rounded-card font-medium"
            style={{
              background: "var(--brand)",
              color: "var(--on-brand)",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? "Submitting…" : "Submit night report"}
          </button>
        </div>
      </div>
    </div>
  );
}
