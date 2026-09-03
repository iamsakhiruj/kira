"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import { CAPITAL_OR_OPERATING } from "@/lib/expenses";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import Badge from "@/components/ui/badge";
import { addExpense, editExpense, deleteExpense } from "./actions";

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
  paidTo: string;
  capitalOrOperating: CapOp;
  reference: string;
  note: string;
  receiptUrl: string;
  deleted: boolean;
  deletedReason: string;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

const COLUMNS = 7;

function parseAmt(s: string): number | null {
  if (s.trim() === "") return null;
  try {
    const sen = toSen(s);
    return sen > 0 ? sen : null;
  } catch {
    return null;
  }
}

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
      <td className="px-4 py-3" colSpan={COLUMNS}>
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
      <td className="px-4 py-3" colSpan={COLUMNS}>
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

  const dim = expense.deleted ? { opacity: 0.55 } : undefined;
  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={dim}>{expense.date}</td>
      <td className="px-4 py-3" style={dim}>{expense.categoryName}</td>
      <td className="px-4 py-3 money" style={dim}>{formatRM(expense.amountSen)}</td>
      <td className="px-4 py-3" style={dim}>{expense.paymentMethodName}</td>
      <td className="px-4 py-3" style={dim}>
        {expense.paidTo || "—"}
        {expense.deleted ? (
          <span className="ml-2 align-middle">
            <Badge tone="muted">Deleted</Badge>
            {expense.deletedReason ? (
              <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}> · {expense.deletedReason}</span>
            ) : null}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3" style={{ ...dim, textTransform: "capitalize" }}>
        {expense.capitalOrOperating}
      </td>
      <td className="px-4 py-3 text-right">
        {expense.deleted ? (
          <span style={{ color: "var(--text-faint)", fontSize: "var(--text-label)" }}>—</span>
        ) : (
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setMode("edit")} style={{ color: "var(--brand)" }}>Edit</button>
            <button type="button" onClick={() => setMode("delete")} style={{ color: "var(--text-muted)" }}>Delete</button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function ExpensesManager({
  expenses,
  categories,
  paymentMethods,
  currentDate,
  showDeleted,
}: {
  expenses: ExpenseRow[];
  categories: Option[];
  paymentMethods: Option[];
  currentDate: string;
  showDeleted: boolean;
}) {
  const deletedCount = expenses.filter((e) => e.deleted).length;
  return (
    <div className="flex flex-col gap-4">
      <AddForm categories={categories} paymentMethods={paymentMethods} currentDate={currentDate} />
      <div className="flex justify-end">
        <Link
          href={showDeleted ? "/expenses" : "/expenses?deleted=1"}
          style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
        >
          {showDeleted ? "Hide deleted" : "Show deleted"}
          {showDeleted && deletedCount > 0 ? ` (${deletedCount})` : ""}
        </Link>
      </div>
      <DataTable
        delayMs={80}
        columns={[
          { key: "date", header: "Date" },
          { key: "category", header: "Category" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "method", header: "Payment method" },
          { key: "paidTo", header: "Paid to" },
          { key: "type", header: "Capital / operating" },
          { key: "actions", header: "" },
        ]}
        isEmpty={expenses.length === 0}
        emptyMessage="No expenses recorded yet."
      >
        {expenses.map((e) => (
          <Row key={e.id} expense={e} categories={categories} paymentMethods={paymentMethods} />
        ))}
      </DataTable>
    </div>
  );
}
