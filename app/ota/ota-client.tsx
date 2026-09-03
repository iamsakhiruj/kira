"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import { commissionShortfallSen } from "@/lib/otaSummary";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import Badge from "@/components/ui/badge";
import {
  recordOtaRemittance,
  recordOtaCommissionExpense,
  editOtaRemittance,
  deleteOtaRemittance,
} from "./actions";

interface Remittance {
  id: string;
  platformId: string;
  platformName: string;
  date: string;
  amountReceivedSen: number;
  outstandingCoveredSen: number;
  paymentMethodId: string;
  paymentMethodName: string;
  reference: string;
  note: string;
  deleted: boolean;
  deletedReason: string;
}

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
  remittances,
  showDeleted,
  activePlatforms,
  paymentMethods,
  today,
}: {
  rows: Row[];
  remittances: Remittance[];
  showDeleted: boolean;
  activePlatforms: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  today: string;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
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

      <RemittanceHistory
        remittances={remittances}
        activePlatforms={activePlatforms}
        paymentMethods={paymentMethods}
        showDeleted={showDeleted}
      />
    </div>
  );
}

// --- remittance history (edit / soft-delete) ------------------------------

const REMIT_COLS = 6;

function RemitEditRow({ remittance, activePlatforms, paymentMethods, onDone }: {
  remittance: Remittance;
  activePlatforms: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [platformId, setPlatformId] = useState(remittance.platformId);
  const [date, setDate] = useState(remittance.date);
  const [received, setReceived] = useState(fromSen(remittance.amountReceivedSen));
  const [covered, setCovered] = useState(fromSen(remittance.outstandingCoveredSen));
  const [methodId, setMethodId] = useState(remittance.paymentMethodId);
  const [reference, setReference] = useState(remittance.reference);
  const [note, setNote] = useState(remittance.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    if (amtInvalid(received) || amtInvalid(covered)) return setError("Enter valid amounts.");
    setPending(true);
    const res = await editOtaRemittance(remittance.id, {
      platformId, date, amountReceivedSen: sen(received), outstandingCoveredSen: sen(covered),
      paymentMethodId: methodId, reference, note,
    });
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }

  // The platform may be inactive (historical); include it so the select shows it.
  const platformOptions = activePlatforms.some((p) => p.id === platformId)
    ? activePlatforms
    : [{ id: platformId, name: remittance.platformName }, ...activePlatforms];

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--page)" }}>
      <td className="px-4 py-3" colSpan={REMIT_COLS}>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select aria-label="Edit remittance platform" value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle}>
              {platformOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input aria-label="Edit remittance date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit received" inputMode="decimal" placeholder="Received" value={received} onChange={(e) => setReceived(e.target.value)} className="money h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit outstanding covered" inputMode="decimal" placeholder="Outstanding covered" value={covered} onChange={(e) => setCovered(e.target.value)} className="money h-9 rounded border px-2" style={fieldStyle} />
            <select aria-label="Edit remittance method" value={methodId} onChange={(e) => setMethodId(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle}>
              {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input aria-label="Edit remittance reference" placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit remittance note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 rounded border px-2 sm:col-span-3" style={fieldStyle} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={pending} onClick={save} style={{ color: "var(--brand)", fontWeight: 600 }}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>Cancel</button>
            {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function RemitDeleteRow({ remittance, onDone }: { remittance: Remittance; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function confirm() {
    setError(null);
    if (!reason.trim()) return setError("Enter a reason.");
    setPending(true);
    const res = await deleteOtaRemittance(remittance.id, reason.trim());
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }
  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--warn-bg)" }}>
      <td className="px-4 py-3" colSpan={REMIT_COLS}>
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: "var(--text-label)" }}>Delete this {formatRM(remittance.amountReceivedSen)} remittance? Reason:</span>
          <input aria-label="Delete remittance reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 flex-1 rounded border px-2" style={{ ...fieldStyle, minWidth: 160 }} />
          <button type="button" disabled={pending} onClick={confirm} style={{ color: "var(--warn)", fontWeight: 600 }}>{pending ? "Deleting…" : "Confirm delete"}</button>
          <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>Cancel</button>
          {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
        </div>
      </td>
    </tr>
  );
}

function RemitRow({ remittance, activePlatforms, paymentMethods }: {
  remittance: Remittance;
  activePlatforms: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  if (mode === "edit") return <RemitEditRow remittance={remittance} activePlatforms={activePlatforms} paymentMethods={paymentMethods} onDone={() => setMode("view")} />;
  if (mode === "delete") return <RemitDeleteRow remittance={remittance} onDone={() => setMode("view")} />;

  const dim = remittance.deleted ? { opacity: 0.55 } : undefined;
  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={dim}>{remittance.date}</td>
      <td className="px-4 py-3" style={dim}>{remittance.platformName}</td>
      <td className="px-4 py-3 money" style={dim}>{formatRM(remittance.amountReceivedSen)}</td>
      <td className="px-4 py-3" style={dim}>{remittance.paymentMethodName}</td>
      <td className="px-4 py-3" style={dim}>
        {remittance.reference || "—"}
        {remittance.deleted ? (
          <span className="ml-2 align-middle"><Badge tone="muted">Deleted</Badge>
            {remittance.deletedReason ? <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}> · {remittance.deletedReason}</span> : null}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right">
        {remittance.deleted ? (
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

function RemittanceHistory({ remittances, activePlatforms, paymentMethods, showDeleted }: {
  remittances: Remittance[];
  activePlatforms: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  showDeleted: boolean;
}) {
  const deletedCount = remittances.filter((r) => r.deleted).length;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Remittance history</h2>
        <Link href={showDeleted ? "/ota" : "/ota?deleted=1"} style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}>
          {showDeleted ? "Hide deleted" : "Show deleted"}{showDeleted && deletedCount > 0 ? ` (${deletedCount})` : ""}
        </Link>
      </div>
      <DataTable
        columns={[
          { key: "date", header: "Date" },
          { key: "platform", header: "Platform" },
          { key: "received", header: "Received", align: "right" },
          { key: "method", header: "Method" },
          { key: "reference", header: "Reference" },
          { key: "actions", header: "" },
        ]}
        isEmpty={remittances.length === 0}
        emptyMessage="No remittances recorded yet."
      >
        {remittances.map((r) => (
          <RemitRow key={r.id} remittance={r} activePlatforms={activePlatforms} paymentMethods={paymentMethods} />
        ))}
      </DataTable>
    </section>
  );
}
