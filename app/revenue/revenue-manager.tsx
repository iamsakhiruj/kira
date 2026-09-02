"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, formatRM } from "@/lib/money";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import { addRevenueEntry } from "./actions";

interface Option {
  id: string;
  name: string;
}

interface RevenueRow {
  id: string;
  date: string;
  categoryName: string;
  amountSen: number;
  paymentMethodName: string;
  receivedFrom: string;
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
    if (amountSen === null) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!categoryId) {
      setError("Choose a category — add one in Settings first if the list is empty.");
      return;
    }
    if (!paymentMethodId) {
      setError("Choose a payment method.");
      return;
    }
    setPending(true);
    const res = await addRevenueEntry({
      date,
      categoryId,
      amountSen,
      paymentMethodId,
      receivedFrom,
      reference,
      note,
    });
    setPending(false);
    if (res.ok) {
      setAmount("");
      setReceivedFrom("");
      setReference("");
      setNote("");
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
          <input
            aria-label="Revenue date"
            type="date"
            max={currentDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Category</span>
          <select
            aria-label="Revenue category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-11 rounded border px-2"
            style={fieldStyle}
          >
            {categories.length === 0 ? <option value="">No categories yet</option> : null}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Amount (RM)</span>
          <input
            aria-label="Revenue amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="money h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
          <select
            aria-label="Revenue payment method"
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="h-11 rounded border px-2"
            style={fieldStyle}
          >
            {paymentMethods.length === 0 ? <option value="">No payment methods yet</option> : null}
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Received from</span>
          <input
            aria-label="Received from"
            value={receivedFrom}
            onChange={(e) => setReceivedFrom(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference (optional)</span>
          <input
            aria-label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Note (optional)</span>
          <input
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="btn-primary h-11 self-start rounded-card px-4 font-medium"
        style={{ opacity: pending ? 0.7 : 1 }}
      >
        {pending ? "Adding…" : "Add revenue entry"}
      </button>
    </FormPanel>
  );
}

export default function RevenueManager({
  entries,
  categories,
  paymentMethods,
  currentDate,
}: {
  entries: RevenueRow[];
  categories: Option[];
  paymentMethods: Option[];
  currentDate: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AddForm categories={categories} paymentMethods={paymentMethods} currentDate={currentDate} />
      <DataTable
        delayMs={80}
        columns={[
          { key: "date", header: "Date" },
          { key: "category", header: "Category" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "method", header: "Payment method" },
          { key: "from", header: "Received from" },
        ]}
        isEmpty={entries.length === 0}
        emptyMessage="No revenue entries recorded yet."
      >
        {entries.map((e) => (
          <tr key={e.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
            <td className="px-4 py-3">{e.date}</td>
            <td className="px-4 py-3">{e.categoryName}</td>
            <td className="px-4 py-3 money">{formatRM(e.amountSen)}</td>
            <td className="px-4 py-3">{e.paymentMethodName}</td>
            <td className="px-4 py-3">{e.receivedFrom || "—"}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
