"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, formatRM } from "@/lib/money";
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
    <div className="flex flex-col gap-3 rounded-card border p-4" style={fieldStyle}>
      <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Add revenue entry</h2>
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
      {error ? (
        <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="h-11 self-start rounded-card px-4 font-medium"
        style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}
      >
        {pending ? "Adding…" : "Add revenue entry"}
      </button>
    </div>
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-left">Payment method</th>
              <th className="p-2 text-left">Received from</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td className="p-2" colSpan={5} style={{ color: "var(--text-muted)" }}>
                  No revenue entries recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="p-2">{e.date}</td>
                  <td className="p-2">{e.categoryName}</td>
                  <td className="p-2 money">{formatRM(e.amountSen)}</td>
                  <td className="p-2">{e.paymentMethodName}</td>
                  <td className="p-2">{e.receivedFrom || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
