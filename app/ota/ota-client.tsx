"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import { commissionShortfallSen } from "@/lib/otaSummary";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import { recordOtaRemittance, recordOtaCommissionExpense } from "./actions";

interface Row {
  platformId: string;
  name: string;
  bookingsCount: number;
  revenueBookedSen: number;
  receivedSen: number;
  outstandingSen: number;
}

function parseAmt(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    return toSen(s);
  } catch {
    return null;
  }
}
function amtInvalid(s: string): boolean {
  const v = parseAmt(s);
  return v === null || v < 0;
}
function sen(s: string): number {
  const v = parseAmt(s);
  return v === null ? 0 : v;
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
      className="money h-10 w-full rounded border px-3"
      style={{ ...fieldStyle, borderColor: invalid ? "var(--warn)" : "var(--border-strong)" }}
    />
  );
}

/** The commission-shortfall follow-up. Shown only after a remittance is
 * recorded that covers more outstanding than it actually paid. Posting the
 * expense is a separate, explicit action — never automatic. */
function CommissionPrompt({
  platformName,
  shortfallSen,
  paymentMethods,
  today,
  onDone,
}: {
  platformName: string;
  shortfallSen: number;
  paymentMethods: { id: string; name: string }[];
  today: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(fromSen(shortfallSen));
  const [date, setDate] = useState(today);
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setError(null);
    if (amtInvalid(amount) || sen(amount) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!paymentMethodId) {
      setError("Choose a payment method.");
      return;
    }
    setPending(true);
    const res = await recordOtaCommissionExpense({
      platformName,
      amountSen: sen(amount),
      date,
      paymentMethodId,
      note,
    });
    setPending(false);
    if (res.ok) {
      onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded-card border p-3"
      style={{ background: "var(--warn-bg)", borderColor: "var(--warn)" }}
    >
      <p style={{ fontSize: "var(--text-label)", color: "var(--text)" }}>
        This remittance leaves {formatRM(shortfallSen)} short of what it
        covers — likely {platformName}&apos;s commission. Record it as an
        expense against &ldquo;OTA commission&rdquo;?
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Amount (RM)
          </span>
          <MoneyInput ariaLabel="Commission amount" value={amount} onChange={setAmount} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Date
          </span>
          <input
            aria-label="Commission date"
            type="date"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Payment method
          </span>
          <select
            aria-label="Commission payment method"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
          >
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Note (optional)
          </span>
          <input
            aria-label="Commission note"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={record}
          className="btn-primary h-9 rounded-card px-3 font-medium"
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Recording…" : "Record expense"}
        </button>
        <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>
          Skip
        </button>
      </div>
    </div>
  );
}

function RemittanceForm({
  row,
  paymentMethods,
  today,
  onDone,
}: {
  row: Row;
  paymentMethods: { id: string; name: string }[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [amountReceived, setAmountReceived] = useState("");
  const [outstandingCovered, setOutstandingCovered] = useState(fromSen(row.outstandingSen));
  const [date, setDate] = useState(today);
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);

  async function record() {
    setError(null);
    if (amtInvalid(amountReceived) || amtInvalid(outstandingCovered)) {
      setError("Amounts can't be negative. Check the fields outlined in amber.");
      return;
    }
    if (!paymentMethodId) {
      setError("Choose a payment method.");
      return;
    }
    setPending(true);
    const res = await recordOtaRemittance({
      platformId: row.platformId,
      date,
      amountReceivedSen: sen(amountReceived),
      outstandingCoveredSen: sen(outstandingCovered),
      paymentMethodId,
      reference,
      note,
    });
    setPending(false);
    if (res.ok) {
      const gap = commissionShortfallSen(sen(outstandingCovered), sen(amountReceived));
      router.refresh();
      if (gap > 0) {
        setShortfall(gap);
      } else {
        onDone();
      }
    } else {
      setError(res.error);
    }
  }

  if (shortfall !== null) {
    return (
      <CommissionPrompt
        platformName={row.name}
        shortfallSen={shortfall}
        paymentMethods={paymentMethods}
        today={today}
        onDone={onDone}
      />
    );
  }

  return (
    <FormPanel error={error} className="mt-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Amount received (RM)
          </span>
          <MoneyInput ariaLabel="Amount received" value={amountReceived} onChange={setAmountReceived} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Amount this covers (RM)
          </span>
          <MoneyInput ariaLabel="Amount covered" value={outstandingCovered} onChange={setOutstandingCovered} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Date
          </span>
          <input
            aria-label="Remittance date"
            type="date"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Payment method
          </span>
          <select
            aria-label="Remittance payment method"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
          >
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Reference (optional)
          </span>
          <input
            aria-label="Remittance reference"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            Note (optional)
          </span>
          <input
            aria-label="Remittance note"
            className="h-10 rounded border px-2"
            style={fieldStyle}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={record}
          className="btn-primary h-9 rounded-card px-3 font-medium"
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Recording…" : "Record remittance"}
        </button>
        <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </FormPanel>
  );
}

export default function OtaClient({
  rows,
  paymentMethods,
  today,
}: {
  rows: Row[];
  paymentMethods: { id: string; name: string }[];
  today: string;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <DataTable
      animate
      columns={[
        { key: "platform", header: "Platform" },
        { key: "bookings", header: "Bookings", align: "right" },
        { key: "revenue", header: "Revenue booked", align: "right" },
        { key: "received", header: "Received", align: "right" },
        { key: "outstanding", header: "Outstanding", align: "right" },
        { key: "actions", header: "" },
      ]}
      isEmpty={rows.length === 0}
      emptyMessage="No active OTA platforms yet — add one in Settings."
    >
      {rows.map((row) => (
        <Fragment key={row.platformId}>
          <tr
            className="table-row-hover"
            style={{ borderBottom: openRow === row.platformId ? "none" : "1px solid var(--border)" }}
          >
            <td className="px-4 py-3">{row.name}</td>
            <td className="px-4 py-3 money">{row.bookingsCount}</td>
            <td className="px-4 py-3 money">{formatRM(row.revenueBookedSen)}</td>
            <td className="px-4 py-3 money">{formatRM(row.receivedSen)}</td>
            <td
              className="px-4 py-3 money"
              style={{
                fontWeight: 600,
                color: row.outstandingSen > 0 ? "var(--warn)" : undefined,
              }}
            >
              {formatRM(row.outstandingSen)}
            </td>
            <td className="px-4 py-3 text-right">
              <button
                type="button"
                onClick={() => setOpenRow(openRow === row.platformId ? null : row.platformId)}
                style={{ color: "var(--brand)" }}
              >
                {openRow === row.platformId ? "Close" : "Record remittance"}
              </button>
            </td>
          </tr>
          {openRow === row.platformId ? (
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td colSpan={6} className="px-2 pb-3">
                <RemittanceForm
                  row={row}
                  paymentMethods={paymentMethods}
                  today={today}
                  onDone={() => setOpenRow(null)}
                />
              </td>
            </tr>
          ) : null}
        </Fragment>
      ))}
    </DataTable>
  );
}
