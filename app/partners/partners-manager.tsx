"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import { formatBp } from "@/lib/partners";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import {
  addPartner,
  editPartner,
  saveShares,
  addTransaction,
  editTransaction,
  deleteTransaction,
} from "./actions";

interface Balance {
  allocatedSen: number;
  injectionsSen: number;
  drawingsSen: number;
  balanceSen: number;
  directorLoanSen: number;
}
interface LinkedEmployee {
  id: string;
  name: string;
  position: string;
  payType: string;
  basicAmountSen: number;
  payments: { id: string; month: string; netSen: number; status: string }[];
}
interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string;
  active: boolean;
  joinedDate: string;
  exitDate: string | null;
  notes: string;
  currentShareBp: number | null;
  balance: Balance;
  linkedEmployees: LinkedEmployee[];
}
interface ShareRow {
  id: string;
  partnerName: string;
  percentageBp: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}
interface Txn {
  id: string;
  partnerId: string;
  partnerName: string;
  date: string;
  amountSen: number;
  direction: "drawing" | "injection";
  purpose: string;
  paymentMethodId: string;
  paymentMethodName: string;
  reference: string;
  note: string;
  deleted: boolean;
  deletedReason: string;
}
interface Method {
  id: string;
  name: string;
}

const PURPOSE_LABELS: Record<string, string> = {
  salary: "Salary",
  dividend: "Dividend",
  reimbursement: "Reimbursement",
  loan_repayment: "Loan repayment",
  director_loan: "Director's loan",
};
const PURPOSES = Object.keys(PURPOSE_LABELS);

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

/** RM string -> non-negative sen, or null. */
function parseMoney(s: string): number | null {
  if (s.trim() === "") return null;
  try {
    const sen = toSen(s);
    return sen >= 1 ? sen : null;
  } catch {
    return null;
  }
}

/** Percentage string ("33.33") -> basis points (3333), or null. */
function parsePercentBp(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const bp = Math.round(n * 100);
  return bp > 0 && bp <= 10000 ? bp : null;
}

// --- partner card + form --------------------------------------------------

function PartnerForm({
  initial,
  partnerId,
  onDone,
}: {
  initial?: Partner;
  partnerId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [joinedDate, setJoinedDate] = useState(initial?.joinedDate ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [exitDate, setExitDate] = useState(initial?.exitDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim() || !joinedDate) {
      setError("Name and joined date are required.");
      return;
    }
    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      active,
      joinedDate,
      exitDate: active ? null : exitDate || null,
      notes,
    };
    setPending(true);
    const res = partnerId ? await editPartner(partnerId, payload) : await addPartner(payload);
    setPending(false);
    if (res.ok) {
      router.refresh();
      onDone?.();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel error={error} animate={!partnerId}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Name</span>
          <input className="h-11 rounded border px-3" style={fieldStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Email</span>
          <input className="h-11 rounded border px-3" style={fieldStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Phone</span>
          <input className="h-11 rounded border px-3" style={fieldStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Joined date</span>
          <input type="date" className="h-11 rounded border px-3" style={fieldStyle} value={joinedDate} onChange={(e) => setJoinedDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Status</span>
          <select
            className="h-11 rounded border px-2"
            style={fieldStyle}
            value={active ? "active" : "exited"}
            onChange={(e) => setActive(e.target.value === "active")}
          >
            <option value="active">Active</option>
            <option value="exited">Exited</option>
          </select>
        </label>
        {!active ? (
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Exit date</span>
            <input type="date" className="h-11 rounded border px-3" style={fieldStyle} value={exitDate ?? ""} onChange={(e) => setExitDate(e.target.value)} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Notes</span>
          <input className="h-11 rounded border px-3" style={fieldStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={submit} className="btn-primary h-11 rounded-card px-4 font-medium" style={{ opacity: pending ? 0.7 : 1 }}>
          {pending ? "Saving…" : partnerId ? "Save changes" : "Add partner"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className="h-11 rounded-card px-4" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        ) : null}
      </div>
    </FormPanel>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
  const [editing, setEditing] = useState(false);
  const b = partner.balance;

  if (editing) return <PartnerForm initial={partner} partnerId={partner.id} onDone={() => setEditing(false)} />;

  return (
    <Card tone="neutral" className="flex flex-col gap-3 p-4" style={{ opacity: partner.active ? 1 : 0.7 }}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2" style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            {partner.name}
            {!partner.active ? (
              <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>Exited {partner.exitDate ?? ""}</span>
            ) : null}
          </h3>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            {partner.currentShareBp != null ? `Current share ${formatBp(partner.currentShareBp)}%` : "No current share"}
            {partner.email ? ` · ${partner.email}` : ""}
            {partner.phone ? ` · ${partner.phone}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} style={{ color: "var(--brand)" }}>
          Edit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" style={{ fontSize: "var(--text-label)" }}>
        <div>
          <div style={{ color: "var(--text-muted)" }}>Allocated</div>
          <div className="money">{formatRM(b.allocatedSen)}</div>
          <div style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
            from locked profit allocations
          </div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)" }}>Injections</div>
          <div className="money money-in">{formatRM(b.injectionsSen)}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)" }}>Drawings</div>
          <div className="money money-out">−{formatRM(b.drawingsSen)}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)" }}>Balance</div>
          <div className={"money" + (b.balanceSen < 0 ? " money-out" : "")} style={{ fontWeight: 600 }}>
            {b.balanceSen < 0 ? "−" : ""}
            {formatRM(Math.abs(b.balanceSen))}
          </div>
        </div>
      </div>

      {b.directorLoanSen > 0 ? (
        <p className="rounded-card px-3 py-2" style={{ background: "var(--warn-bg)", color: "var(--warn)", fontSize: "var(--text-caption)" }}>
          Director&apos;s loan outstanding {formatRM(b.directorLoanSen)} — Section 140B: an
          interest-free director&apos;s loan is deemed to earn taxable interest. Document or settle it.
          Any deemed interest is computed by your accountant at the Bank Negara rate — not here.
        </p>
      ) : null}

      {partner.linkedEmployees.length ? (
        <div style={{ fontSize: "var(--text-caption)" }}>
          <div style={{ color: "var(--text-muted)" }}>Director salary (linked employee)</div>
          {partner.linkedEmployees.map((e) => (
            <div key={e.id} className="mt-1">
              <span>{e.name} · {e.position} · {e.payType === "monthly" ? "Monthly" : "Daily"} {formatRM(e.basicAmountSen)}</span>
              {e.payments.length ? (
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}· latest{" "}
                  <Link href={`/salary/${e.payments[0].id}`} style={{ color: "var(--brand)" }}>
                    {e.payments[0].month} net {formatRM(e.payments[0].netSen)} ({e.payments[0].status})
                  </Link>
                </span>
              ) : (
                <span style={{ color: "var(--text-faint)" }}> · no payslips yet</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

// --- shares editor --------------------------------------------------------

function SharesEditor({
  partners,
  history,
  today,
}: {
  partners: Partner[];
  history: ShareRow[];
  today: string;
}) {
  const router = useRouter();
  const activePartners = useMemo(() => partners.filter((p) => p.active), [partners]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      activePartners.map((p) => [p.id, p.currentShareBp != null ? formatBp(p.currentShareBp) : ""]),
    ),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const lines = activePartners
    .map((p) => ({ partnerId: p.id, bp: parsePercentBp(values[p.id] ?? "") }))
    .filter((l) => l.bp != null) as { partnerId: string; bp: number }[];
  const totalBp = lines.reduce((s, l) => s + l.bp, 0);
  const balanced = totalBp === 10000;

  async function save() {
    setError(null);
    if (!effectiveFrom) {
      setError("Choose an effective-from date.");
      return;
    }
    if (!balanced) {
      setError(`Shares must total exactly 100% — currently ${formatBp(totalBp)}%.`);
      return;
    }
    setPending(true);
    const res = await saveShares({
      effectiveFrom,
      lines: lines.map((l) => ({ partnerId: l.partnerId, percentageBp: l.bp })),
    });
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <FormPanel title="Shares" error={error}>
      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
        Setting a new set closes the current one and opens a new effective-dated set — history is never overwritten.
        Active shares must total exactly 100%.
      </p>

      {activePartners.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Add an active partner first.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {activePartners.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <span style={{ width: 180 }}>{p.name}</span>
                <input
                  inputMode="decimal"
                  className="money h-11 w-28 rounded border px-3"
                  style={fieldStyle}
                  placeholder="0.00"
                  value={values[p.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [p.id]: e.target.value })}
                />
                <span style={{ color: "var(--text-muted)" }}>%</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <span
              style={{
                fontSize: "var(--text-label)",
                fontWeight: 600,
                color: balanced ? "var(--text)" : "var(--warn)",
              }}
            >
              Total: {formatBp(totalBp)}% {balanced ? "✓" : "(must be 100%)"}
            </span>
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Effective from</span>
              <input type="date" className="h-11 rounded border px-3" style={fieldStyle} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={pending || !balanced}
              onClick={save}
              className="btn-primary h-11 rounded-card px-4 font-medium"
              style={{ opacity: pending || !balanced ? 0.5 : 1 }}
            >
              {pending ? "Saving…" : "Save share set"}
            </button>
          </div>
        </>
      )}

      <DataTable
        columns={[
          { key: "partner", header: "Partner" },
          { key: "share", header: "Share", align: "right" },
          { key: "from", header: "From" },
          { key: "to", header: "To" },
        ]}
        isEmpty={history.length === 0}
        emptyMessage="No share history yet."
      >
        {history.map((h) => (
          <tr key={h.id} className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
            <td className="px-4 py-3">{h.partnerName}</td>
            <td className="px-4 py-3 money">{formatBp(h.percentageBp)}%</td>
            <td className="px-4 py-3">{h.effectiveFrom}</td>
            <td className="px-4 py-3">{h.effectiveTo ?? "current"}</td>
          </tr>
        ))}
      </DataTable>
    </FormPanel>
  );
}

// --- transactions ---------------------------------------------------------

function TransactionForm({
  partners,
  methods,
  today,
}: {
  partners: Partner[];
  methods: Method[];
  today: string;
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"drawing" | "injection">("drawing");
  const [purpose, setPurpose] = useState("dividend");
  const [methodId, setMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    const amountSen = parseMoney(amount);
    if (!partnerId) return setError("Choose a partner.");
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    if (!methodId) return setError("Choose a payment method.");
    if (!date) return setError("Enter a date.");
    setPending(true);
    const res = await addTransaction({
      partnerId,
      date,
      amountSen,
      direction,
      purpose,
      paymentMethodId: methodId,
      reference: reference.trim(),
      note,
    });
    setPending(false);
    if (res.ok) {
      setAmount("");
      setReference("");
      setNote("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <FormPanel title="Record money in / out" error={error}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Partner</span>
          <select className="h-11 rounded border px-2" style={fieldStyle} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">— choose —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (exited)"}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Date</span>
          <input type="date" className="h-11 rounded border px-3" style={fieldStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Amount (RM)</span>
          <input inputMode="decimal" className="money h-11 rounded border px-3" style={fieldStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Direction</span>
          <select className="h-11 rounded border px-2" style={fieldStyle} value={direction} onChange={(e) => setDirection(e.target.value as "drawing" | "injection")}>
            <option value="drawing">Drawing (out to partner)</option>
            <option value="injection">Injection (in from partner)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Purpose</span>
          <select className="h-11 rounded border px-2" style={fieldStyle} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
          <select className="h-11 rounded border px-2" style={fieldStyle} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            <option value="">— choose —</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference</span>
          <input className="h-11 rounded border px-3" style={fieldStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Note</span>
          <input className="h-11 rounded border px-3" style={fieldStyle} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {purpose === "salary" ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
          A partner&apos;s salary is normally recorded through payroll (the Salary screen), not here — it&apos;s subject to PCB/EPF. Use this only if you know you need it.
        </p>
      ) : null}
      {purpose === "director_loan" ? (
        <p className="rounded-card px-3 py-2" style={{ background: "var(--warn-bg)", color: "var(--warn)", fontSize: "var(--text-caption)" }}>
          Section 140B: a director&apos;s loan from the company that isn&apos;t charged interest at the prescribed rate is deemed to earn taxable interest for the director. Keep it documented.
        </p>
      ) : null}

      <button type="button" disabled={pending} onClick={submit} className="btn-primary h-11 self-start rounded-card px-4 font-medium" style={{ opacity: pending ? 0.7 : 1 }}>
        {pending ? "Recording…" : "Record"}
      </button>
    </FormPanel>
  );
}

const TXN_COLS = 8;

function TxnEditRow({ txn, partners, methods, onDone }: {
  txn: Txn;
  partners: { id: string; name: string; active: boolean }[];
  methods: Method[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState(txn.partnerId);
  const [date, setDate] = useState(txn.date);
  const [amount, setAmount] = useState(fromSen(txn.amountSen));
  const [direction, setDirection] = useState<"drawing" | "injection">(txn.direction);
  const [purpose, setPurpose] = useState(txn.purpose);
  const [methodId, setMethodId] = useState(txn.paymentMethodId);
  const [reference, setReference] = useState(txn.reference);
  const [note, setNote] = useState(txn.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    let amountSen: number;
    try { amountSen = toSen(amount); } catch { return setError("Enter a valid amount."); }
    if (amountSen <= 0) return setError("Enter an amount greater than zero.");
    setPending(true);
    const res = await editTransaction(txn.id, {
      partnerId, date, amountSen, direction, purpose, paymentMethodId: methodId, reference, note,
    });
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--page)" }}>
      <td className="px-4 py-3" colSpan={TXN_COLS}>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select aria-label="Edit partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (exited)"}</option>)}
            </select>
            <input aria-label="Edit txn date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit txn amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="money h-9 rounded border px-2" style={fieldStyle} />
            <select aria-label="Edit direction" value={direction} onChange={(e) => setDirection(e.target.value as "drawing" | "injection")} className="h-9 rounded border px-2" style={fieldStyle}>
              <option value="drawing">Drawing (out)</option>
              <option value="injection">Injection (in)</option>
            </select>
            <select aria-label="Edit purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle}>
              {PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
            </select>
            <select aria-label="Edit txn method" value={methodId} onChange={(e) => setMethodId(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle}>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input aria-label="Edit txn reference" placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            <input aria-label="Edit txn note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
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

function TxnDeleteRow({ txn, onDone }: { txn: Txn; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function confirm() {
    setError(null);
    if (!reason.trim()) return setError("Enter a reason.");
    setPending(true);
    const res = await deleteTransaction(txn.id, reason.trim());
    setPending(false);
    if (res.ok) { router.refresh(); onDone(); } else { setError(res.error); }
  }
  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--warn-bg)" }}>
      <td className="px-4 py-3" colSpan={TXN_COLS}>
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: "var(--text-label)" }}>Delete this {formatRM(txn.amountSen)} transaction? Reason:</span>
          <input aria-label="Delete txn reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 flex-1 rounded border px-2" style={{ ...fieldStyle, minWidth: 160 }} />
          <button type="button" disabled={pending} onClick={confirm} style={{ color: "var(--warn)", fontWeight: 600 }}>{pending ? "Deleting…" : "Confirm delete"}</button>
          <button type="button" onClick={onDone} style={{ color: "var(--text-muted)" }}>Cancel</button>
          {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
        </div>
      </td>
    </tr>
  );
}

function TxnRow({ txn, partners, methods }: {
  txn: Txn;
  partners: { id: string; name: string; active: boolean }[];
  methods: Method[];
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  if (mode === "edit") return <TxnEditRow txn={txn} partners={partners} methods={methods} onDone={() => setMode("view")} />;
  if (mode === "delete") return <TxnDeleteRow txn={txn} onDone={() => setMode("view")} />;

  const dim = txn.deleted ? { opacity: 0.55 } : undefined;
  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3" style={dim}>{txn.date}</td>
      <td className="px-4 py-3" style={dim}>{txn.partnerName}</td>
      <td className="px-4 py-3" style={dim}>
        <span className={txn.direction === "injection" ? "money-in" : "money-out"}>{txn.direction === "injection" ? "In" : "Out"}</span>
      </td>
      <td className="px-4 py-3" style={dim}>
        {PURPOSE_LABELS[txn.purpose] ?? txn.purpose}
        {txn.purpose === "director_loan" ? <Badge tone="warn" className="ml-1">s.140B</Badge> : null}
      </td>
      <td className="px-4 py-3 money" style={dim}>
        <span className={txn.direction === "injection" ? "money-in" : "money-out"}>
          {txn.direction === "injection" ? "" : "−"}{formatRM(txn.amountSen)}
        </span>
      </td>
      <td className="px-4 py-3" style={dim}>{txn.paymentMethodName}</td>
      <td className="px-4 py-3" style={dim}>
        {txn.reference || "—"}
        {txn.deleted ? (
          <span className="ml-2 align-middle"><Badge tone="muted">Deleted</Badge>
            {txn.deletedReason ? <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}> · {txn.deletedReason}</span> : null}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right">
        {txn.deleted ? (
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

function TransactionsTable({ transactions, partners, methods, showDeleted }: {
  transactions: Txn[];
  partners: { id: string; name: string; active: boolean }[];
  methods: Method[];
  showDeleted: boolean;
}) {
  const deletedCount = transactions.filter((t) => t.deleted).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Link href={showDeleted ? "/partners" : "/partners?deleted=1"} style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}>
          {showDeleted ? "Hide deleted" : "Show deleted"}{showDeleted && deletedCount > 0 ? ` (${deletedCount})` : ""}
        </Link>
      </div>
      <DataTable
        delayMs={40}
        columns={[
          { key: "date", header: "Date" },
          { key: "partner", header: "Partner" },
          { key: "direction", header: "Direction" },
          { key: "purpose", header: "Purpose" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "method", header: "Method" },
          { key: "reference", header: "Reference" },
          { key: "actions", header: "" },
        ]}
        isEmpty={transactions.length === 0}
        emptyMessage="No partner transactions yet."
      >
        {transactions.map((t) => (
          <TxnRow key={t.id} txn={t} partners={partners} methods={methods} />
        ))}
      </DataTable>
    </div>
  );
}

// --- top-level ------------------------------------------------------------

export default function PartnersManager({
  partners,
  shareHistory,
  transactions,
  paymentMethods,
  today,
  showDeleted,
}: {
  partners: Partner[];
  shareHistory: ShareRow[];
  transactions: Txn[];
  paymentMethods: Method[];
  today: string;
  showDeleted: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Owners</h2>
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="h-11 rounded-card border px-4" style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}>
              + Add partner
            </button>
          ) : null}
        </div>
        {adding ? <PartnerForm onDone={() => setAdding(false)} /> : null}
        {partners.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No partners yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {partners.map((p) => (
              <PartnerCard key={p.id} partner={p} />
            ))}
          </div>
        )}
      </section>

      <SharesEditor partners={partners} history={shareHistory} today={today} />

      <section className="flex flex-col gap-3">
        <TransactionForm partners={partners} methods={paymentMethods} today={today} />
        <TransactionsTable
          transactions={transactions}
          partners={partners.map((p) => ({ id: p.id, name: p.name, active: p.active }))}
          methods={paymentMethods}
          showDeleted={showDeleted}
        />
      </section>
    </div>
  );
}
