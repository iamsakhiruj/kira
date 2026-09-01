"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import {
  PAID_BY,
  reconcile,
  requiresVarianceReason,
  revenueGap,
  occupancyRatio,
  adrSen,
  revparSen,
  totalRevenueSen,
} from "@/lib/nightReport";
import { draftKeyFor, switchDraftDate } from "@/lib/draftStorage";
import { submitNightReport } from "./actions";

type Amt = string; // raw user input, parsed to sen with lib/money

// Category is a plain string, not a literal union — the list is DB-editable
// (Phase 2 §2.3, categories collection), fetched server-side and passed in
// as revenueCategoryNames/expenseCategoryNames rather than imported here.
interface RevenueRow {
  id: number;
  category: string;
  amount: Amt;
  note: string;
}
interface ExpenseRow {
  id: number;
  category: string;
  amount: Amt;
  paidTo: string;
  paidBy: (typeof PAID_BY)[number];
  note: string;
  receiptUrl: string;
}
interface FormState {
  rooms: {
    available: string;
    sold: string;
    houseUse: string;
    revenue: Amt;
    reportPhotoUrl: string;
  };
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
    receivablesSettled: Amt;
  };
  expenses: ExpenseRow[];
  cash: { openingFloat: Amt; bankedIn: Amt; counted: Amt };
  remarks: string;
  varianceReason: string;
  revenueGapReason: string;
  enteredLateReason: string;
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
      reportPhotoUrl: "",
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
      receivablesSettled: "",
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
    revenueGapReason: "",
    enteredLateReason: "",
  };
}

/** Parse an amount field to sen. Empty is 0; unparseable is null. */
function parseAmt(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    return toSen(s);
  } catch {
    return null;
  }
}
/** True if the field is unparseable OR a valid-but-negative amount — every
 * amount on this form must be zero or more, so both count as "fix this". */
function amtInvalid(s: string): boolean {
  const v = parseAmt(s);
  return v === null || v < 0;
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
  const invalid = amtInvalid(value);
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

/** Highest row id already in use in a loaded draft, so newly added rows
 * never reuse an id from a different date's draft — `nextId` is a ref that
 * persists across date switches, but a freshly *mounted* component always
 * restarts it at 1, which could otherwise collide with ids already present
 * in whatever draft gets loaded (on mount, or on switching to a date with
 * its own existing draft). */
function maxRowId(state: FormState): number {
  const ids = [...state.revenueLines, ...state.expenses].map((r) => r.id);
  return ids.length ? Math.max(...ids) : 0;
}

export default function NightReportForm({
  date: initialDate,
  currentDate,
  minDate,
  maxDate,
  defaults,
  varianceThresholdSen,
  revenueGapThresholdSen,
  expenseCeilingSen,
  revenueCategoryNames,
  expenseCategoryNames,
}: {
  date: string;
  currentDate: string;
  minDate: string | undefined;
  maxDate: string;
  defaults: Defaults;
  varianceThresholdSen: number;
  revenueGapThresholdSen: number;
  expenseCeilingSen: number;
  revenueCategoryNames: string[];
  expenseCategoryNames: string[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [state, setState] = useState<FormState>(() => initialState(defaults));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const nextId = useRef(1);

  // Load any locally saved draft for the initial date, once, on mount
  // (client only — localStorage doesn't exist during SSR, which is why this
  // has to be an effect rather than a lazy useState initializer). Date
  // changes after mount are handled explicitly by handleDateChange below,
  // not by re-running this effect — it must only ever see the date this
  // component was first opened with.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKeyFor(initialDate));
      if (raw) {
        const loadedState = JSON.parse(raw) as FormState;
        setState(loadedState);
        nextId.current = maxRowId(loadedState) + 1;
      }
    } catch {
      // ignore a corrupt draft
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  // Autosave so a dropped connection at 1am doesn't lose the entry.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(draftKeyFor(date), JSON.stringify(state));
    } catch {
      // storage full / unavailable — nothing we can do, keep going
    }
  }, [state, date]);

  // Switching dates must never lose the entry for the date being left — see
  // lib/draftStorage.ts. Saves the outgoing date's state under its own key
  // first, then loads (or blanks) the incoming date, warning first if the
  // outgoing entry has anything in it.
  function handleDateChange(newDate: string) {
    if (newDate === date) return;
    const blank = initialState(defaults);
    const dirty = JSON.stringify(state) !== JSON.stringify(blank);
    if (dirty) {
      const proceed = window.confirm(
        `You have an entry in progress for ${date}. It's saved and won't be lost — switching dates shows that date's own entry instead. Continue?`,
      );
      if (!proceed) return;
    }
    const nextState = switchDraftDate(localStorage, date, state, newDate, blank);
    nextId.current = maxRowId(nextState) + 1;
    setError(null);
    setDate(newDate);
    setState(nextState);
  }

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
    const totalRevSen = totalRevenueSen(roomRevenueSen, revenueLinesSen);
    const gap = revenueGap({
      totalRevenueSen: totalRevSen,
      collections: {
        cashSen: sen(state.collections.cash),
        cardSen: sen(state.collections.card),
        transferSen: sen(state.collections.transfer),
        ewalletSen: sen(state.collections.ewallet),
        otaPrepaidSen: sen(state.collections.otaPrepaid),
        chargeToAccountSen: sen(state.collections.chargeToAccount),
        refundsSen: sen(state.collections.refunds),
        receivablesSettledSen: sen(state.collections.receivablesSettled),
      },
    });
    return {
      occupancy: occupancyRatio(sold, available),
      adr: adrSen(roomRevenueSen, sold),
      revpar: revparSen(roomRevenueSen, available),
      totalRevenueSen: totalRevSen,
      recon,
      reasonRequired: requiresVarianceReason(
        recon.varianceSen,
        varianceThresholdSen,
      ),
      gap,
      gapReasonRequired: requiresVarianceReason(
        gap.gapSen,
        revenueGapThresholdSen,
      ),
    };
  }, [state, varianceThresholdSen, revenueGapThresholdSen]);

  const set = (updater: (s: FormState) => FormState) =>
    setState((s) => updater(structuredClone(s)));

  function addRevenueLine() {
    set((s) => {
      s.revenueLines.push({
        id: nextId.current++,
        category: revenueCategoryNames[0] ?? "",
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
        category: expenseCategoryNames[0] ?? "",
        amount: "",
        paidTo: "",
        paidBy: "cash",
        note: "",
        receiptUrl: "",
      });
      return s;
    });
  }

  async function handleSubmit() {
    setError(null);

    // Every amount must parse, and none may be negative (an amber-outlined
    // field catches this before the user even reaches Submit).
    const badAmount =
      amtInvalid(state.rooms.revenue) ||
      Object.values(state.collections).some((v) => amtInvalid(v)) ||
      Object.values(state.cash).some((v) => amtInvalid(v)) ||
      state.revenueLines.some((l) => amtInvalid(l.amount)) ||
      state.expenses.some((e) => amtInvalid(e.amount));
    if (badAmount) {
      setError(
        "Some amounts aren't valid — an amount can't be negative. Check the fields outlined in amber.",
      );
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
    if (derived.gapReasonRequired && !state.revenueGapReason.trim()) {
      setError(
        `Revenue is ${formatRM(Math.abs(derived.gap.gapSen))} ${
          derived.gap.gapSen < 0 ? "under" : "over"
        } what collections and receivables account for. Enter a reason before submitting.`,
      );
      return;
    }
    const overCeiling = state.expenses.find(
      (e) => sen(e.amount) > expenseCeilingSen && !e.note.trim(),
    );
    if (overCeiling) {
      setError(
        `The ${formatRM(sen(overCeiling.amount))} "${overCeiling.category}" expense is over the ${formatRM(expenseCeilingSen)} ceiling — add a note for the owner before submitting.`,
      );
      return;
    }
    if (date !== currentDate && !state.enteredLateReason.trim()) {
      setError(
        `This report is for ${date}, not today — enter a short reason it's being entered late.`,
      );
      return;
    }

    const report = {
      rooms: {
        available,
        sold,
        houseUse,
        revenueSen: sen(state.rooms.revenue),
        reportPhotoUrl: state.rooms.reportPhotoUrl.trim() || undefined,
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
        receivablesSettledSen: sen(state.collections.receivablesSettled),
      },
      expenses: state.expenses.map((e) => ({
        category: e.category,
        amountSen: sen(e.amount),
        paidTo: e.paidTo,
        paidBy: e.paidBy,
        note: e.note,
        receiptUrl: e.receiptUrl.trim() || undefined,
      })),
      cash: {
        openingFloatSen: sen(state.cash.openingFloat),
        bankedInSen: sen(state.cash.bankedIn),
        countedSen: sen(state.cash.counted),
      },
      remarks: state.remarks,
      varianceReason: state.varianceReason,
      revenueGapReason: state.revenueGapReason,
      enteredLateReason: state.enteredLateReason,
    };

    setPending(true);
    try {
      const res = await submitNightReport({ date, report });
      if (res.ok) {
        try {
          localStorage.removeItem(draftKeyFor(date));
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
  const gapStyle: React.CSSProperties = derived.gapReasonRequired
    ? { color: "var(--warn)", background: "var(--warn-bg)" }
    : { color: "var(--text-muted)" };
  const isBackdated = date !== currentDate;

  return (
    <div className="flex flex-col gap-6 pb-40">
      {/* Date */}
      <section className="flex flex-col gap-3">
        <Row label="Report date">
          <input
            aria-label="Report date"
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </Row>
        {isBackdated ? (
          <Row label="Why is this being entered late? (required)">
            <input
              aria-label="Reason entered late"
              placeholder="e.g. power cut, sick shift, forgotten"
              className="h-11 rounded border px-3"
              style={{
                ...fieldStyle,
                borderColor: state.enteredLateReason.trim()
                  ? "var(--border-strong)"
                  : "var(--warn)",
              }}
              value={state.enteredLateReason}
              onChange={(e) =>
                set((s) => ((s.enteredLateReason = e.target.value), s))
              }
            />
          </Row>
        ) : null}
      </section>

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
        <Row label="iHotel report photo link (optional)">
          <input
            aria-label="iHotel report photo link"
            placeholder="Paste a link — WhatsApp, Google Photos, etc."
            className="h-11 rounded border px-3"
            style={fieldStyle}
            value={state.rooms.reportPhotoUrl}
            onChange={(e) =>
              set((s) => ((s.rooms.reportPhotoUrl = e.target.value), s))
            }
          />
        </Row>
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
                  set((s) => ((s.revenueLines[i].category = e.target.value), s))
                }
              >
                {revenueCategoryNames.map((c) => (
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
              ["receivablesSettled", "Receivables settled today"],
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
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          &ldquo;Receivables settled today&rdquo; is money above that pays off an old
          bill — e.g. a monthly guest clearing last month&apos;s account — not new
          revenue. Leave at 0 on an ordinary night.
        </p>
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
                  set((s) => ((s.expenses[i].category = ev.target.value), s))
                }
              >
                {expenseCategoryNames.map((c) => (
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
            {(() => {
              const overCeiling =
                sen(e.amount) > expenseCeilingSen && !e.note.trim();
              return (
                <>
                  <input
                    aria-label="Expense note"
                    placeholder={
                      sen(e.amount) > expenseCeilingSen
                        ? `Over ${formatRM(expenseCeilingSen)} — note for the owner (required)`
                        : "Note (optional)"
                    }
                    className="h-11 rounded border px-3"
                    style={{
                      ...fieldStyle,
                      borderColor: overCeiling ? "var(--warn)" : "var(--border-strong)",
                    }}
                    value={e.note}
                    onChange={(ev) => set((s) => ((s.expenses[i].note = ev.target.value), s))}
                  />
                  {overCeiling ? (
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>
                      This is over the {formatRM(expenseCeilingSen)} per-item ceiling —
                      add a note explaining it for the owner.
                    </p>
                  ) : null}
                </>
              );
            })()}
            <input
              aria-label="Receipt photo link"
              placeholder="Receipt photo link (optional)"
              className="h-11 rounded border px-3"
              style={fieldStyle}
              value={e.receiptUrl}
              onChange={(ev) => set((s) => ((s.expenses[i].receiptUrl = ev.target.value), s))}
            />
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
        {derived.gapReasonRequired ? (
          <Row label="Reason for the revenue gap (required)">
            <input
              aria-label="Revenue gap reason"
              className="h-11 rounded border px-3"
              style={fieldStyle}
              value={state.revenueGapReason}
              onChange={(e) => set((s) => ((s.revenueGapReason = e.target.value), s))}
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
          <div
            className="flex items-center justify-between rounded px-2 py-1"
            style={gapStyle}
          >
            <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>
              Revenue gap{derived.gapReasonRequired ? " — out of tolerance" : ""}
            </span>
            <span className="money" style={{ fontWeight: 600 }}>
              {derived.gap.gapSen > 0 ? "+" : ""}
              {formatRM(derived.gap.gapSen)}
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
