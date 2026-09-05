"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM, MoneyError } from "@/lib/money";
import { CAPITAL_OR_OPERATING } from "@/lib/expenses";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import Badge from "@/components/ui/badge";
import EntrySummaryCards from "@/components/entry-summary-cards";
import {
  filterStandaloneLedgerLines,
  groupStandaloneLedgerByDate,
  standaloneLedgerGrandTotalSen,
  standaloneChannelSummary,
  type StandaloneLedgerLine,
} from "@/lib/standaloneLedger";
import { addExpense, editExpense, deleteExpense, addCapitalInjection } from "./actions";

interface Option {
  id: string;
  name: string;
}
type CapOp = (typeof CAPITAL_OR_OPERATING)[number];

interface ExpenseRow {
  id: string;
  date: string;
  categoryId: string;
  categoryName: string;
  amountSen: number;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodType: string;
  paidTo: string;
  capitalOrOperating: CapOp;
  reference: string;
  note: string;
  receiptUrl: string;
  enteredBy: string;
  deleted: boolean;
  deletedReason: string;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

const COLUMNS = 8;

function parseAmt(s: string): number | null {
  if (s.trim() === "") return null;
  try {
    const sen = toSen(s);
    return sen > 0 ? sen : null;
  } catch {
    return null;
  }
}

function parseMinAmount(input: string): number | undefined {
  if (!input.trim()) return undefined;
  try {
    return toSen(input);
  } catch (err) {
    if (err instanceof MoneyError) return undefined;
    throw err;
  }
}

function toLedgerLine(e: ExpenseRow): StandaloneLedgerLine {
  return {
    id: e.id,
    date: e.date,
    category: e.categoryName,
    note: e.note,
    counterparty: e.paidTo,
    paymentMethod: e.paymentMethodName,
    paymentMethodType: e.paymentMethodType,
    amountSen: e.amountSen,
    enteredBy: e.enteredBy,
  };
}

// ---------------------------------------------------------------------------
// Add expense form
// ---------------------------------------------------------------------------

function AddForm({ categories, paymentMethods, currentDate }: {
  categories: Option[];
  paymentMethods: Option[];
  currentDate: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [paidTo, setPaidTo] = useState("");
  const [capitalOrOperating, setCapitalOrOperating] = useState<CapOp>("operating");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    const amountSen = parseAmt(amount);
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    if (!categoryId) return setError("Choose a category — add one in Settings first if the list is empty.");
    if (!paymentMethodId) return setError("Choose a payment method.");
    setPending(true);
    const res = await addExpense({
      date, categoryId, amountSen, paymentMethodId, paidTo, capitalOrOperating, reference, note,
    });
    setPending(false);
    if (res.ok) {
      setAmount(""); setPaidTo(""); setReference(""); setNote("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Add expense" error={error} animate delayMs={40}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Date</span>
          <input aria-label="Expense date" type="date" max={currentDate} value={date}
            onChange={(e) => setDate(e.target.value)} className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Category</span>
          <select aria-label="Expense category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="h-11 rounded border px-2" style={fieldStyle}>
            {categories.length === 0 ? <option value="">No categories yet</option> : null}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Amount (RM)</span>
          <input aria-label="Expense amount" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value)} className="money h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
          <select aria-label="Expense payment method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
            className="h-11 rounded border px-2" style={fieldStyle}>
            {paymentMethods.length === 0 ? <option value="">No payment methods yet</option> : null}
            {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Paid to</span>
          <input aria-label="Paid to" value={paidTo} onChange={(e) => setPaidTo(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Capital or operating</span>
          <select aria-label="Capital or operating" value={capitalOrOperating}
            onChange={(e) => setCapitalOrOperating(e.target.value as CapOp)} className="h-11 rounded border px-2" style={fieldStyle}>
            <option value="operating">Operating</option>
            <option value="capital">Capital</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference (optional)</span>
          <input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Note (optional)</span>
          <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
      </div>
      <button type="button" disabled={pending} onClick={submit}
        className="btn-primary h-11 self-start rounded-card px-4 font-medium" style={{ opacity: pending ? 0.7 : 1 }}>
        {pending ? "Adding…" : "Add expense"}
      </button>
    </FormPanel>
  );
}

// ---------------------------------------------------------------------------
// Capital injection form — owner only, deliberately its own form so it can
// never be confused with a normal expense (it isn't one).
// ---------------------------------------------------------------------------

function AddCapitalInjectionForm({ partners, paymentMethods, currentDate }: {
  partners: Option[];
  paymentMethods: Option[];
  currentDate: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(currentDate);
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setSuccess(false);
    const amountSen = parseAmt(amount);
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    if (!partnerId) return setError("Choose a partner — add one in Partners first if the list is empty.");
    if (!paymentMethodId) return setError("Choose a payment method.");
    setPending(true);
    const res = await addCapitalInjection({ date, partnerId, amountSen, paymentMethodId, reference, note });
    setPending(false);
    if (res.ok) {
      setAmount(""); setReference(""); setNote(""); setSuccess(true);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Capital injection (owner)" error={error} animate delayMs={60}>
      <p style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        Money the owner puts into the business. This is not an expense — it never reduces
        profit. It increases cash and shows in your balance under Partners.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Date</span>
          <input aria-label="Injection date" type="date" max={currentDate} value={date}
            onChange={(e) => setDate(e.target.value)} className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Partner</span>
          <select aria-label="Injection partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
            className="h-11 rounded border px-2" style={fieldStyle}>
            {partners.length === 0 ? <option value="">No partners yet</option> : null}
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Amount (RM)</span>
          <input aria-label="Injection amount" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value)} className="money h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
          <select aria-label="Injection payment method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
            className="h-11 rounded border px-2" style={fieldStyle}>
            {paymentMethods.length === 0 ? <option value="">No payment methods yet</option> : null}
            {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference (optional)</span>
          <input aria-label="Injection reference" value={reference} onChange={(e) => setReference(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Note (optional)</span>
          <input aria-label="Injection note" value={note} onChange={(e) => setNote(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={submit}
          className="h-11 self-start rounded-card px-4 font-medium" style={{ opacity: pending ? 0.7 : 1, border: "1px solid var(--brand)", color: "var(--brand)" }}>
          {pending ? "Recording…" : "Record injection"}
        </button>
        {success ? (
          <span className="money-in" style={{ fontSize: "var(--text-label)" }}>Injection recorded.</span>
        ) : null}
      </div>
    </FormPanel>
  );
}

// ---------------------------------------------------------------------------
// Edit / delete rows (unchanged behavior from before)
// ---------------------------------------------------------------------------

function EditRow({ expense, categories, paymentMethods, onDone }: {
  expense: ExpenseRow;
  categories: Option[];
  paymentMethods: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(expense.date);
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [amount, setAmount] = useState(fromSen(expense.amountSen));
  const [paymentMethodId, setPaymentMethodId] = useState(expense.paymentMethodId);
  const [paidTo, setPaidTo] = useState(expense.paidTo);
  const [capitalOrOperating, setCapitalOrOperating] = useState<CapOp>(expense.capitalOrOperating);
  const [reference, setReference] = useState(expense.reference);
  const [note, setNote] = useState(expense.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    const amountSen = parseAmt(amount);
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    setPending(true);
    const res = await editExpense(expense.id, {
      date, categoryId, amountSen, paymentMethodId, paidTo, capitalOrOperating, reference, note,
      receiptUrl: expense.receiptUrl || undefined,
    });
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--page)" }}>
      <td className="px-3 py-3" colSpan={COLUMNS}>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input aria-label="Edit date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded border px-2" style={fieldStyle} />
            <select aria-label="Edit category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 rounded border px-2" style={fieldStyle}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input aria-label="Edit amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="money h-9 rounded border px-2" style={fieldStyle} />
            <select aria-label="Edit payment method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
              className="h-9 rounded border px-2" style={fieldStyle}>
              {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input aria-label="Edit paid to" placeholder="Paid to" value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <select aria-label="Edit capital or operating" value={capitalOrOperating}
              onChange={(e) => setCapitalOrOperating(e.target.value as CapOp)} className="h-9 rounded border px-2" style={fieldStyle}>
              <option value="operating">Operating</option>
              <option value="capital">Capital</option>
            </select>
            <input aria-label="Edit reference" placeholder="Reference" value={reference}
              onChange={(e) => setReference(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)}
              className="h-9 rounded border px-2 sm:col-span-2" style={fieldStyle} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={pending} onClick={save} style={{ color: "var(--brand)", fontWeight: 600 }}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>Cancel</button>
            {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DeleteRow({ expense, onDone }: { expense: ExpenseRow; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setError(null);
    if (!reason.trim()) return setError("Enter a reason.");
    setPending(true);
    const res = await deleteExpense(expense.id, reason.trim());
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--warn-bg)" }}>
      <td className="px-3 py-3" colSpan={COLUMNS}>
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: "var(--text-label)" }}>
            Delete this {formatRM(expense.amountSen)} expense? Reason (required):
          </span>
          <input aria-label="Delete reason" value={reason} onChange={(e) => setReason(e.target.value)}
            className="h-9 flex-1 rounded border px-2" style={{ ...fieldStyle, minWidth: 200 }} />
          <button type="button" disabled={pending} onClick={confirm} style={{ color: "var(--warn)", fontWeight: 600 }}>
            {pending ? "Deleting…" : "Confirm delete"}
          </button>
          <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>Cancel</button>
          {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
        </div>
      </td>
    </tr>
  );
}

function Row({ expense, categories, paymentMethods }: {
  expense: ExpenseRow;
  categories: Option[];
  paymentMethods: Option[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");

  if (mode === "edit") {
    return <EditRow expense={expense} categories={categories} paymentMethods={paymentMethods} onDone={() => setMode("view")} />;
  }
  if (mode === "delete") {
    return <DeleteRow expense={expense} onDone={() => setMode("view")} />;
  }

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-3 py-2">{expense.date}</td>
      <td className="px-3 py-2">{expense.categoryName}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{expense.note || "—"}</td>
      <td className="px-3 py-2">{expense.paidTo || "—"}</td>
      <td className="px-3 py-2">{expense.paymentMethodName}</td>
      <td className="px-3 py-2 money text-right">{formatRM(expense.amountSen)}</td>
      <td className="px-3 py-2">{expense.enteredBy}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-3">
          <a href={`/expenses/${expense.id}/voucher`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>
            Voucher
          </a>
          <button type="button" onClick={() => setMode("edit")} style={{ color: "var(--brand)" }}>Edit</button>
          <button type="button" onClick={() => setMode("delete")} style={{ color: "var(--text-muted)" }}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

function DeletedRow({ expense }: { expense: ExpenseRow }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.55 }}>
      <td className="px-3 py-2">{expense.date}</td>
      <td className="px-3 py-2">{expense.categoryName}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{expense.note || "—"}</td>
      <td className="px-3 py-2">{expense.paidTo || "—"}</td>
      <td className="px-3 py-2">{expense.paymentMethodName}</td>
      <td className="px-3 py-2 money text-right">{formatRM(expense.amountSen)}</td>
      <td className="px-3 py-2">{expense.enteredBy}</td>
      <td className="px-3 py-2">
        <Badge tone="muted">Deleted</Badge>
        {expense.deletedReason ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}> · {expense.deletedReason}</span>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Filter bar + summary + day-by-day list
// ---------------------------------------------------------------------------

function ExpenseWorkspace({
  expenses,
  categories,
  paymentMethods,
  showDeleted,
  deletedExpenses,
  rangeFrom,
  rangeTo,
}: {
  expenses: ExpenseRow[];
  categories: Option[];
  paymentMethods: Option[];
  showDeleted: boolean;
  deletedExpenses: ExpenseRow[];
  rangeFrom: string;
  rangeTo: string;
}) {
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [minAmountInput, setMinAmountInput] = useState("");

  const lines = useMemo(() => expenses.map(toLedgerLine), [expenses]);
  const rowById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(lines.map((l) => l.category))).sort((a, b) => a.localeCompare(b)),
    [lines],
  );
  const paymentMethodOptions = useMemo(
    () => Array.from(new Set(lines.map((l) => l.paymentMethod))).sort((a, b) => a.localeCompare(b)),
    [lines],
  );

  const minAmountSen = parseMinAmount(minAmountInput);
  const hasFilters = !!category || !!paymentMethod || minAmountSen !== undefined;

  const filteredLines = useMemo(
    () =>
      filterStandaloneLedgerLines(lines, {
        category: category || undefined,
        paymentMethod: paymentMethod || undefined,
        minAmountSen,
      }),
    [lines, category, paymentMethod, minAmountSen],
  );

  const groups = useMemo(() => groupStandaloneLedgerByDate(filteredLines, "desc"), [filteredLines]);
  const grandTotalSen = standaloneLedgerGrandTotalSen(filteredLines);
  const channelSummary = standaloneChannelSummary(filteredLines);

  function clearFilters() {
    setCategory("");
    setPaymentMethod("");
    setMinAmountInput("");
  }

  return (
    <div className="flex flex-col gap-4">
      <EntrySummaryCards
        totalSen={grandTotalSen}
        entryCount={filteredLines.length}
        channelSummary={channelSummary}
        tone="expense"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Category</span>
            <select aria-label="Filter by category" className="h-9 rounded border px-2" style={fieldStyle}
              value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
            <select aria-label="Filter by payment method" className="h-9 rounded border px-2" style={fieldStyle}
              value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">All methods</option>
              {paymentMethodOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Minimum amount</span>
            <input aria-label="Minimum amount" inputMode="decimal" placeholder="0.00"
              className="money h-9 w-28 rounded border px-2" style={fieldStyle}
              value={minAmountInput} onChange={(e) => setMinAmountInput(e.target.value)} />
          </label>
          {hasFilters ? (
            <button type="button" onClick={clearFilters} style={{ fontSize: "var(--text-label)", color: "var(--brand)", height: 36 }}>
              Clear filters
            </button>
          ) : null}
        </div>
        <Link
          href={showDeleted ? `/expenses?from=${rangeFrom}&to=${rangeTo}` : `/expenses?from=${rangeFrom}&to=${rangeTo}&deleted=1`}
          style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
        >
          {showDeleted ? "Hide deleted" : "Show deleted"}
        </Link>
      </div>

      <DataTable
        columns={[
          { key: "date", header: "Date" },
          { key: "category", header: "Category" },
          { key: "note", header: "Description" },
          { key: "paidTo", header: "Paid to" },
          { key: "method", header: "Payment method" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "enteredBy", header: "Entered by" },
          { key: "actions", header: "" },
        ]}
        isEmpty={filteredLines.length === 0}
        emptyMessage="No expenses match this range and filters."
      >
        {groups.map((group) => (
          <Fragment key={group.date}>
            <tr style={{ background: "var(--page)" }}>
              <td colSpan={5} className="px-3 py-2" style={{ fontWeight: 600 }}>
                {group.date}
              </td>
              <td className="px-3 py-2 money text-right" style={{ fontWeight: 600 }}>
                {formatRM(group.subtotalSen)}
              </td>
              <td colSpan={2} />
            </tr>
            {group.lines.map((l) => (
              <Row key={l.id} expense={rowById.get(l.id)!} categories={categories} paymentMethods={paymentMethods} />
            ))}
          </Fragment>
        ))}
        {filteredLines.length > 0 ? (
          <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-strong)" }}>
            <td colSpan={5} className="px-3 py-3">Grand total</td>
            <td className="px-3 py-3 money text-right">{formatRM(grandTotalSen)}</td>
            <td colSpan={2} />
          </tr>
        ) : null}
      </DataTable>

      {showDeleted ? (
        <DataTable
          columns={[
            { key: "date", header: "Date" },
            { key: "category", header: "Category" },
            { key: "note", header: "Description" },
            { key: "paidTo", header: "Paid to" },
            { key: "method", header: "Payment method" },
            { key: "amount", header: "Amount", align: "right" },
            { key: "enteredBy", header: "Entered by" },
            { key: "status", header: "" },
          ]}
          isEmpty={deletedExpenses.length === 0}
          emptyMessage="No deleted expenses in this range."
        >
          {deletedExpenses.map((e) => <DeletedRow key={e.id} expense={e} />)}
        </DataTable>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function ExpensesManager({
  expenses,
  deletedExpenses,
  categories,
  paymentMethods,
  partners,
  currentDate,
  rangeFrom,
  rangeTo,
  showDeleted,
  isOwner,
}: {
  expenses: ExpenseRow[];
  deletedExpenses: ExpenseRow[];
  categories: Option[];
  paymentMethods: Option[];
  partners: Option[];
  currentDate: string;
  rangeFrom: string;
  rangeTo: string;
  showDeleted: boolean;
  isOwner: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AddForm categories={categories} paymentMethods={paymentMethods} currentDate={currentDate} />
      {isOwner ? (
        <AddCapitalInjectionForm partners={partners} paymentMethods={paymentMethods} currentDate={currentDate} />
      ) : null}
      <ExpenseWorkspace
        expenses={expenses}
        deletedExpenses={deletedExpenses}
        categories={categories}
        paymentMethods={paymentMethods}
        showDeleted={showDeleted}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
      />
    </div>
  );
}
