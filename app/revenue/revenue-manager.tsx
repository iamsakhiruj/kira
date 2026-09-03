"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import Badge from "@/components/ui/badge";
import { addRevenueEntry, editRevenueEntry, deleteRevenueEntry } from "./actions";

interface Option {
  id: string;
  name: string;
}

interface RevenueRow {
  id: string;
  date: string;
  categoryId: string;
  categoryName: string;
  amountSen: number;
  paymentMethodId: string;
  paymentMethodName: string;
  receivedFrom: string;
  reference: string;
  note: string;
  deleted: boolean;
  deletedReason: string;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function parseAmt(s: string): number | null {
  if (s.trim() === "") return null;
  try {
    const sen = toSen(s);
    return sen > 0 ? sen : null;
  } catch {
    return null;
  }
}

const COLUMNS = 6;

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
  const [receivedFrom, setReceivedFrom] = useState("");
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
    const res = await addRevenueEntry({
      date, categoryId, amountSen, paymentMethodId, receivedFrom, reference, note,
    });
    setPending(false);
    if (res.ok) {
      setAmount(""); setReceivedFrom(""); setReference(""); setNote("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Add revenue entry" error={error} animate delayMs={40}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Date</span>
          <input aria-label="Revenue date" type="date" max={currentDate} value={date}
            onChange={(e) => setDate(e.target.value)} className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Category</span>
          <select aria-label="Revenue category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="h-11 rounded border px-2" style={fieldStyle}>
            {categories.length === 0 ? <option value="">No categories yet</option> : null}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Amount (RM)</span>
          <input aria-label="Revenue amount" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value)} className="money h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
          <select aria-label="Revenue payment method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
            className="h-11 rounded border px-2" style={fieldStyle}>
            {paymentMethods.length === 0 ? <option value="">No payment methods yet</option> : null}
            {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Received from</span>
          <input aria-label="Received from" value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference (optional)</span>
          <input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Note (optional)</span>
          <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)}
            className="h-11 rounded border px-3" style={fieldStyle} />
        </label>
      </div>
      <button type="button" disabled={pending} onClick={submit}
        className="btn-primary h-11 self-start rounded-card px-4 font-medium" style={{ opacity: pending ? 0.7 : 1 }}>
        {pending ? "Adding…" : "Add revenue entry"}
      </button>
    </FormPanel>
  );
}

function EditRow({ entry, categories, paymentMethods, onDone }: {
  entry: RevenueRow;
  categories: Option[];
  paymentMethods: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(entry.date);
  const [categoryId, setCategoryId] = useState(entry.categoryId);
  const [amount, setAmount] = useState(fromSen(entry.amountSen));
  const [paymentMethodId, setPaymentMethodId] = useState(entry.paymentMethodId);
  const [receivedFrom, setReceivedFrom] = useState(entry.receivedFrom);
  const [reference, setReference] = useState(entry.reference);
  const [note, setNote] = useState(entry.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    const amountSen = parseAmt(amount);
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    setPending(true);
    const res = await editRevenueEntry(entry.id, {
      date, categoryId, amountSen, paymentMethodId, receivedFrom, reference, note,
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
            <input aria-label="Edit received from" placeholder="Received from" value={receivedFrom}
              onChange={(e) => setReceivedFrom(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit reference" placeholder="Reference" value={reference}
              onChange={(e) => setReference(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)}
              className="h-9 rounded border px-2 sm:col-span-3" style={fieldStyle} />
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

function DeleteRow({ entry, onDone }: { entry: RevenueRow; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setError(null);
    if (!reason.trim()) return setError("Enter a reason.");
    setPending(true);
    const res = await deleteRevenueEntry(entry.id, reason.trim());
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--warn-bg)" }}>
      <td className="px-4 py-3" colSpan={COLUMNS}>
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: "var(--text-label)" }}>
            Delete this {formatRM(entry.amountSen)} entry? Reason (required):
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

function Row({ entry, categories, paymentMethods }: {
  entry: RevenueRow;
  categories: Option[];
  paymentMethods: Option[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");

  if (mode === "edit") {
    return <EditRow entry={entry} categories={categories} paymentMethods={paymentMethods} onDone={() => setMode("view")} />;
  }
  if (mode === "delete") {
    return <DeleteRow entry={entry} onDone={() => setMode("view")} />;
  }

  const dim = entry.deleted ? { opacity: 0.55 } : undefined;
  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={dim}>{entry.date}</td>
      <td className="px-4 py-3" style={dim}>{entry.categoryName}</td>
      <td className="px-4 py-3 money" style={dim}>{formatRM(entry.amountSen)}</td>
      <td className="px-4 py-3" style={dim}>{entry.paymentMethodName}</td>
      <td className="px-4 py-3" style={dim}>
        {entry.receivedFrom || "—"}
        {entry.deleted ? (
          <span className="ml-2 align-middle">
            <Badge tone="muted">Deleted</Badge>
            {entry.deletedReason ? (
              <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}> · {entry.deletedReason}</span>
            ) : null}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right">
        {entry.deleted ? (
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

export default function RevenueManager({
  entries,
  categories,
  paymentMethods,
  currentDate,
  showDeleted,
}: {
  entries: RevenueRow[];
  categories: Option[];
  paymentMethods: Option[];
  currentDate: string;
  showDeleted: boolean;
}) {
  const deletedCount = entries.filter((e) => e.deleted).length;
  return (
    <div className="flex flex-col gap-4">
      <AddForm categories={categories} paymentMethods={paymentMethods} currentDate={currentDate} />
      <div className="flex justify-end">
        <Link
          href={showDeleted ? "/revenue" : "/revenue?deleted=1"}
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
          { key: "from", header: "Received from" },
          { key: "actions", header: "" },
        ]}
        isEmpty={entries.length === 0}
        emptyMessage="No revenue entries recorded yet."
      >
        {entries.map((e) => (
          <Row key={e.id} entry={e} categories={categories} paymentMethods={paymentMethods} />
        ))}
      </DataTable>
    </div>
  );
}
