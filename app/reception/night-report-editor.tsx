"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import {
  PAID_BY,
  reconcile,
  requiresVarianceReason,
  revenueGap,
  totalRevenueSen,
} from "@/lib/nightReport";
import { editNightReport } from "./actions";

/**
 * Owner/manager editor for a still-submitted night report, reached from the
 * approval queue. Deliberately SEPARATE from the reception night-report form
 * (that 1am-critical file stays untouched) — but it posts to editNightReport,
 * which re-validates and recomputes variance/gap server-side with the exact
 * same logic as submit. No drafts, no date switching: the date is fixed and
 * shown read-only.
 */

type Amt = string;

export interface EditorInitial {
  rooms: { available: number; sold: number; houseUse: number; revenueSen: number; reportPhotoUrl: string };
  revenueLines: { category: string; amountSen: number; note: string }[];
  collections: {
    cashSen: number; cardSen: number; transferSen: number; ewalletSen: number;
    otaPrepaidSen: number; chargeToAccountSen: number; depositsSen: number;
    refundsSen: number; receivablesSettledSen: number;
  };
  expenses: { category: string; amountSen: number; paidTo: string; paidBy: (typeof PAID_BY)[number]; note: string; receiptUrl: string }[];
  cash: { openingFloatSen: number; bankedInSen: number; countedSen: number };
  remarks: string;
  varianceReason: string;
  revenueGapReason: string;
}

interface RevRow { id: number; category: string; amount: Amt; note: string }
interface ExpRow { id: number; category: string; amount: Amt; paidTo: string; paidBy: (typeof PAID_BY)[number]; note: string; receiptUrl: string }

function parseAmt(s: string): number | null {
  if (s.trim() === "") return 0;
  try { return toSen(s); } catch { return null; }
}
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

const fieldStyle: React.CSSProperties = { borderColor: "var(--border-strong)", background: "var(--surface)" };

function MoneyInput({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  const invalid = amtInvalid(value);
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.00"
      className="money h-11 w-full rounded border px-3"
      style={{ ...fieldStyle, borderColor: invalid ? "var(--warn)" : "var(--border-strong)" }}
    />
  );
}
function IntInput({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
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
function Heading({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>{children}</h2>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

export default function NightReportEditor({
  id,
  date,
  initial,
  varianceThresholdSen,
  revenueGapThresholdSen,
  expenseCeilingSen,
  revenueCategoryNames,
  expenseCategoryNames,
}: {
  id: string;
  date: string;
  initial: EditorInitial;
  varianceThresholdSen: number;
  revenueGapThresholdSen: number;
  expenseCeilingSen: number;
  revenueCategoryNames: string[];
  expenseCategoryNames: string[];
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState({
    available: String(initial.rooms.available),
    sold: String(initial.rooms.sold),
    houseUse: String(initial.rooms.houseUse),
    revenue: fromSen(initial.rooms.revenueSen),
    reportPhotoUrl: initial.rooms.reportPhotoUrl,
  });
  const [revenueLines, setRevenueLines] = useState<RevRow[]>(() =>
    initial.revenueLines.map((l, i) => ({ id: i + 1, category: l.category, amount: fromSen(l.amountSen), note: l.note })),
  );
  const [collections, setCollections] = useState({
    cash: fromSen(initial.collections.cashSen),
    card: fromSen(initial.collections.cardSen),
    transfer: fromSen(initial.collections.transferSen),
    ewallet: fromSen(initial.collections.ewalletSen),
    otaPrepaid: fromSen(initial.collections.otaPrepaidSen),
    chargeToAccount: fromSen(initial.collections.chargeToAccountSen),
    deposits: fromSen(initial.collections.depositsSen),
    refunds: fromSen(initial.collections.refundsSen),
    receivablesSettled: fromSen(initial.collections.receivablesSettledSen),
  });
  const [expenses, setExpenses] = useState<ExpRow[]>(() =>
    initial.expenses.map((e, i) => ({ id: initial.revenueLines.length + 1 + i, category: e.category, amount: fromSen(e.amountSen), paidTo: e.paidTo, paidBy: e.paidBy, note: e.note, receiptUrl: e.receiptUrl })),
  );
  // Seed the id counter above every prefilled row's id (pure expression from
  // props — never read during render). New rows get ids from here in handlers.
  const nextId = useRef(initial.revenueLines.length + initial.expenses.length + 1);
  const [cash, setCash] = useState({
    openingFloat: fromSen(initial.cash.openingFloatSen),
    bankedIn: fromSen(initial.cash.bankedInSen),
    counted: fromSen(initial.cash.countedSen),
  });
  const [remarks, setRemarks] = useState(initial.remarks);
  const [varianceReason, setVarianceReason] = useState(initial.varianceReason);
  const [revenueGapReason, setRevenueGapReason] = useState(initial.revenueGapReason);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derived = useMemo(() => {
    const recon = reconcile({
      collections: { cashSen: sen(collections.cash), refundsSen: sen(collections.refunds) },
      expenses: expenses.map((e) => ({ amountSen: sen(e.amount), paidBy: e.paidBy })),
      cash: { openingFloatSen: sen(cash.openingFloat), bankedInSen: sen(cash.bankedIn), countedSen: sen(cash.counted) },
    });
    const totalRev = totalRevenueSen(sen(rooms.revenue), revenueLines.map((l) => ({ amountSen: sen(l.amount) })));
    const gap = revenueGap({
      totalRevenueSen: totalRev,
      collections: {
        cashSen: sen(collections.cash), cardSen: sen(collections.card), transferSen: sen(collections.transfer),
        ewalletSen: sen(collections.ewallet), otaPrepaidSen: sen(collections.otaPrepaid),
        chargeToAccountSen: sen(collections.chargeToAccount), refundsSen: sen(collections.refunds),
        receivablesSettledSen: sen(collections.receivablesSettled),
      },
    });
    return {
      recon, gap,
      reasonRequired: requiresVarianceReason(recon.varianceSen, varianceThresholdSen),
      gapReasonRequired: requiresVarianceReason(gap.gapSen, revenueGapThresholdSen),
    };
  }, [rooms, revenueLines, collections, expenses, cash, varianceThresholdSen, revenueGapThresholdSen]);

  async function save() {
    setError(null);
    const badAmount =
      amtInvalid(rooms.revenue) ||
      Object.values(collections).some((v) => amtInvalid(v)) ||
      Object.values(cash).some((v) => amtInvalid(v)) ||
      revenueLines.some((l) => amtInvalid(l.amount)) ||
      expenses.some((e) => amtInvalid(e.amount));
    if (badAmount) {
      setError("Some amounts aren't valid — an amount can't be negative. Check the amber fields.");
      return;
    }
    const available = parseCount(rooms.available);
    const sold = parseCount(rooms.sold);
    const houseUse = parseCount(rooms.houseUse);
    if ([available, sold, houseUse].some((n) => Number.isNaN(n))) {
      setError("Room counts must be whole numbers.");
      return;
    }
    if (sold + houseUse > available) {
      setError("Rooms sold plus house use cannot exceed rooms available.");
      return;
    }
    if (derived.reasonRequired && !varianceReason.trim()) {
      setError(`The drawer is ${formatRM(Math.abs(derived.recon.varianceSen))} ${derived.recon.varianceSen < 0 ? "short" : "over"}. Enter a reason.`);
      return;
    }
    if (derived.gapReasonRequired && !revenueGapReason.trim()) {
      setError(`Revenue is ${formatRM(Math.abs(derived.gap.gapSen))} ${derived.gap.gapSen < 0 ? "under" : "over"} what collections account for. Enter a reason.`);
      return;
    }
    const overCeiling = expenses.find((e) => sen(e.amount) > expenseCeilingSen && !e.note.trim());
    if (overCeiling) {
      setError(`The ${formatRM(sen(overCeiling.amount))} "${overCeiling.category}" expense is over the ${formatRM(expenseCeilingSen)} ceiling — add a note.`);
      return;
    }

    const report = {
      rooms: {
        available, sold, houseUse,
        revenueSen: sen(rooms.revenue),
        reportPhotoUrl: rooms.reportPhotoUrl.trim() || undefined,
      },
      revenueLines: revenueLines.map((l) => ({ category: l.category, amountSen: sen(l.amount), note: l.note })),
      collections: {
        cashSen: sen(collections.cash), cardSen: sen(collections.card), transferSen: sen(collections.transfer),
        ewalletSen: sen(collections.ewallet), otaPrepaidSen: sen(collections.otaPrepaid),
        chargeToAccountSen: sen(collections.chargeToAccount), depositsSen: sen(collections.deposits),
        refundsSen: sen(collections.refunds), receivablesSettledSen: sen(collections.receivablesSettled),
      },
      expenses: expenses.map((e) => ({ category: e.category, amountSen: sen(e.amount), paidTo: e.paidTo, paidBy: e.paidBy, note: e.note, receiptUrl: e.receiptUrl.trim() || undefined })),
      cash: { openingFloatSen: sen(cash.openingFloat), bankedInSen: sen(cash.bankedIn), countedSen: sen(cash.counted) },
      remarks, varianceReason, revenueGapReason, enteredLateReason: "",
    };

    setPending(true);
    try {
      const res = await editNightReport(id, report);
      if (res.ok) {
        router.push("/reception");
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't save — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const v = derived.recon.varianceSen;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>Edit report — {date}</h1>
        <p style={{ color: "var(--text-muted)" }}>
          Correcting a submitted report before approval. Variance and the revenue gap are
          recomputed when you save. Once approved, a day locks and can no longer be edited.
        </p>
      </div>

      {/* Rooms */}
      <section className="flex flex-col gap-3">
        <Heading>Rooms</Heading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rooms available"><IntInput ariaLabel="Rooms available" value={rooms.available} onChange={(x) => setRooms({ ...rooms, available: x })} /></Field>
          <Field label="Rooms sold"><IntInput ariaLabel="Rooms sold" value={rooms.sold} onChange={(x) => setRooms({ ...rooms, sold: x })} /></Field>
          <Field label="House use / comp"><IntInput ariaLabel="House use" value={rooms.houseUse} onChange={(x) => setRooms({ ...rooms, houseUse: x })} /></Field>
          <Field label="Room revenue (RM)"><MoneyInput ariaLabel="Room revenue" value={rooms.revenue} onChange={(x) => setRooms({ ...rooms, revenue: x })} /></Field>
        </div>
        <Field label="iHotel report photo link (optional)">
          <input aria-label="iHotel report photo link" className="h-11 rounded border px-3" style={fieldStyle} value={rooms.reportPhotoUrl} onChange={(e) => setRooms({ ...rooms, reportPhotoUrl: e.target.value })} />
        </Field>
      </section>

      {/* Other revenue */}
      <section className="flex flex-col gap-3">
        <Heading>Other revenue</Heading>
        {revenueLines.map((line, i) => (
          <div key={line.id} className="flex flex-col gap-2 rounded-card border p-3" style={fieldStyle}>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Revenue category" className="h-11 rounded border px-2" style={fieldStyle} value={line.category}
                onChange={(e) => setRevenueLines(revenueLines.map((l, j) => j === i ? { ...l, category: e.target.value } : l))}>
                {revenueCategoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                {!revenueCategoryNames.includes(line.category) ? <option value={line.category}>{line.category}</option> : null}
              </select>
              <MoneyInput ariaLabel="Revenue amount" value={line.amount} onChange={(x) => setRevenueLines(revenueLines.map((l, j) => j === i ? { ...l, amount: x } : l))} />
            </div>
            <input aria-label="Revenue note" placeholder="Note (optional)" className="h-11 rounded border px-3" style={fieldStyle} value={line.note}
              onChange={(e) => setRevenueLines(revenueLines.map((l, j) => j === i ? { ...l, note: e.target.value } : l))} />
            <button type="button" onClick={() => setRevenueLines(revenueLines.filter((_, j) => j !== i))} style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setRevenueLines([...revenueLines, { id: nextId.current++, category: revenueCategoryNames[0] ?? "", amount: "", note: "" }])}
          className="h-11 rounded-card border" style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}>+ Add revenue line</button>
      </section>

      {/* Collections */}
      <section className="flex flex-col gap-3">
        <Heading>Collections</Heading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            ["cash", "Cash"], ["card", "Card terminal"], ["transfer", "DuitNow / transfer / QR"], ["ewallet", "E-wallet"],
            ["otaPrepaid", "OTA prepaid (receivable)"], ["chargeToAccount", "Charge to account (receivable)"],
            ["deposits", "Deposits received"], ["refunds", "Refunds paid out"], ["receivablesSettled", "Receivables settled today"],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <MoneyInput ariaLabel={label} value={collections[key]} onChange={(x) => setCollections({ ...collections, [key]: x })} />
            </Field>
          ))}
        </div>
      </section>

      {/* Expenses */}
      <section className="flex flex-col gap-3">
        <Heading>Petty cash &amp; kitchen</Heading>
        {expenses.map((e, i) => {
          const overCeiling = sen(e.amount) > expenseCeilingSen && !e.note.trim();
          return (
            <div key={e.id} className="flex flex-col gap-2 rounded-card border p-3" style={fieldStyle}>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Expense category" className="h-11 rounded border px-2" style={fieldStyle} value={e.category}
                  onChange={(ev) => setExpenses(expenses.map((x, j) => j === i ? { ...x, category: ev.target.value } : x))}>
                  {expenseCategoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                  {!expenseCategoryNames.includes(e.category) ? <option value={e.category}>{e.category}</option> : null}
                </select>
                <MoneyInput ariaLabel="Expense amount" value={e.amount} onChange={(x) => setExpenses(expenses.map((r, j) => j === i ? { ...r, amount: x } : r))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="Paid to" placeholder="Paid to" className="h-11 rounded border px-3" style={fieldStyle} value={e.paidTo}
                  onChange={(ev) => setExpenses(expenses.map((r, j) => j === i ? { ...r, paidTo: ev.target.value } : r))} />
                <select aria-label="Paid by" className="h-11 rounded border px-2" style={fieldStyle} value={e.paidBy}
                  onChange={(ev) => setExpenses(expenses.map((r, j) => j === i ? { ...r, paidBy: ev.target.value as ExpRow["paidBy"] } : r))}>
                  {PAID_BY.map((p) => <option key={p} value={p}>{p === "cash" ? "Paid in cash" : "Paid by card"}</option>)}
                </select>
              </div>
              <input aria-label="Expense note" placeholder={sen(e.amount) > expenseCeilingSen ? `Over ${formatRM(expenseCeilingSen)} — note required` : "Note (optional)"}
                className="h-11 rounded border px-3" style={{ ...fieldStyle, borderColor: overCeiling ? "var(--warn)" : "var(--border-strong)" }}
                value={e.note} onChange={(ev) => setExpenses(expenses.map((r, j) => j === i ? { ...r, note: ev.target.value } : r))} />
              <input aria-label="Receipt photo link" placeholder="Receipt photo link (optional)" className="h-11 rounded border px-3" style={fieldStyle}
                value={e.receiptUrl} onChange={(ev) => setExpenses(expenses.map((r, j) => j === i ? { ...r, receiptUrl: ev.target.value } : r))} />
              <button type="button" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))} style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}>Remove</button>
            </div>
          );
        })}
        <button type="button" onClick={() => setExpenses([...expenses, { id: nextId.current++, category: expenseCategoryNames[0] ?? "", amount: "", paidTo: "", paidBy: "cash", note: "", receiptUrl: "" }])}
          className="h-11 rounded-card border" style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}>+ Add expense</button>
      </section>

      {/* Cash count */}
      <section className="flex flex-col gap-3">
        <Heading>Cash count</Heading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Opening float (RM)"><MoneyInput ariaLabel="Opening float" value={cash.openingFloat} onChange={(x) => setCash({ ...cash, openingFloat: x })} /></Field>
          <Field label="Banked in (RM)"><MoneyInput ariaLabel="Banked in" value={cash.bankedIn} onChange={(x) => setCash({ ...cash, bankedIn: x })} /></Field>
          <Field label="Cash counted (RM)"><MoneyInput ariaLabel="Cash counted" value={cash.counted} onChange={(x) => setCash({ ...cash, counted: x })} /></Field>
        </div>
        <div className="flex items-center justify-between rounded px-2 py-1"
          style={derived.reasonRequired ? { color: "var(--warn)", background: "var(--warn-bg)" } : { color: "var(--text)" }}>
          <span style={{ fontWeight: 600 }}>Expected {formatRM(derived.recon.expectedCashSen)} · Variance{derived.reasonRequired ? " — out of tolerance" : ""}</span>
          <span className="money" style={{ fontWeight: 600 }}>{v > 0 ? "+" : ""}{formatRM(v)}</span>
        </div>
        {derived.reasonRequired ? (
          <Field label="Reason for the variance (required)">
            <input aria-label="Variance reason" className="h-11 rounded border px-3" style={fieldStyle} value={varianceReason} onChange={(e) => setVarianceReason(e.target.value)} />
          </Field>
        ) : null}
        <div className="flex items-center justify-between rounded px-2 py-1"
          style={derived.gapReasonRequired ? { color: "var(--warn)", background: "var(--warn-bg)" } : { color: "var(--text-muted)" }}>
          <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Revenue gap{derived.gapReasonRequired ? " — out of tolerance" : ""}</span>
          <span className="money" style={{ fontWeight: 600 }}>{derived.gap.gapSen > 0 ? "+" : ""}{formatRM(derived.gap.gapSen)}</span>
        </div>
        {derived.gapReasonRequired ? (
          <Field label="Reason for the revenue gap (required)">
            <input aria-label="Revenue gap reason" className="h-11 rounded border px-3" style={fieldStyle} value={revenueGapReason} onChange={(e) => setRevenueGapReason(e.target.value)} />
          </Field>
        ) : null}
      </section>

      {/* Remarks */}
      <section className="flex flex-col gap-3">
        <Heading>Remarks</Heading>
        <textarea aria-label="Remarks" rows={3} className="rounded-card border p-3" style={fieldStyle} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </section>

      {error ? <p role="alert" style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p> : null}
      <div className="flex gap-3">
        <button type="button" disabled={pending} onClick={save} className="h-11 rounded-card px-4 font-medium"
          style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.push("/reception")} className="h-11 rounded-card border px-4"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </div>
  );
}
