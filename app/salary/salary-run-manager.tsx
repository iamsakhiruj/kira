"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fromSen, toSen, formatRM } from "@/lib/money";
import { ORDINARY_RATE_DIVISOR } from "@/lib/salary";
import Badge from "@/components/ui/badge";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import { refreshRun, updateLine, markPaid, adjustLine } from "./actions";

interface Method {
  id: string;
  name: string;
}

interface Line {
  id: string;
  employeeName: string;
  position: string;
  payType: "monthly" | "daily";
  presentDays: number;
  unpaidAbsenceDays: number;
  workingDaysInMonth: number;
  basicEarnedSen: number;
  allowancesSen: number;
  grossSen: number;
  unpaidAbsenceDeductionSen: number;
  advanceRepaymentSen: number;
  otherDeductionSen: number;
  otherDeductionNote: string;
  statutoryDeductionSen: number;
  totalDeductionsSen: number;
  netSen: number;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  paidDate: string | null;
  status: "draft" | "paid";
  directorRemuneration: boolean;
  isAdjustment: boolean;
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

/** RM string -> non-negative sen, or null if unparseable/negative. */
function parseMoney(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    const sen = toSen(s);
    return sen >= 0 ? sen : null;
  } catch {
    return null;
  }
}

function EditForm({ line, methods, onDone }: { line: Line; methods: Method[]; onDone: () => void }) {
  const router = useRouter();
  const [advance, setAdvance] = useState(fromSen(line.advanceRepaymentSen));
  const [other, setOther] = useState(fromSen(line.otherDeductionSen));
  const [otherNote, setOtherNote] = useState(line.otherDeductionNote);
  const [statutory, setStatutory] = useState(fromSen(line.statutoryDeductionSen));
  const [methodId, setMethodId] = useState(line.paymentMethodId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    const advanceSen = parseMoney(advance);
    const otherSen = parseMoney(other);
    const statutorySen = parseMoney(statutory);
    if (advanceSen === null || otherSen === null || statutorySen === null) {
      setError("Deductions can't be negative or unparseable.");
      return;
    }
    if (otherSen > 0 && otherNote.trim() === "") {
      setError("Add a note for the other deduction.");
      return;
    }
    setPending(true);
    const res = await updateLine(line.id, {
      advanceRepaymentSen: advanceSen,
      otherDeductionSen: otherSen,
      otherDeductionNote: otherNote.trim(),
      statutoryDeductionSen: statutorySen,
      paymentMethodId: methodId || null,
    });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--page)" }}>
      <td className="p-3" colSpan={7}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Advance repayment (RM)
            </span>
            <input
              inputMode="decimal"
              className="money h-11 rounded border px-3"
              style={fieldStyle}
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Other deduction (RM)
            </span>
            <input
              inputMode="decimal"
              className="money h-11 rounded border px-3"
              style={fieldStyle}
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Other deduction note
            </span>
            <input
              className="h-11 rounded border px-3"
              style={fieldStyle}
              value={otherNote}
              placeholder="Required if there is an other deduction"
              onChange={(e) => setOtherNote(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Statutory deductions (from accountant) (RM)
            </span>
            <input
              inputMode="decimal"
              className="money h-11 rounded border px-3"
              style={fieldStyle}
              value={statutory}
              onChange={(e) => setStatutory(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
              Payment method
            </span>
            <select
              className="h-11 rounded border px-2"
              style={fieldStyle}
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
            >
              <option value="">— none yet —</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className="mt-2" style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="h-11 rounded-card px-4 font-medium"
            style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}
          >
            {pending ? "Saving…" : "Save deductions"}
          </button>
          <button type="button" onClick={onDone} className="h-11 rounded-card px-4" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function PayForm({ line, methods, onDone }: { line: Line; methods: Method[]; onDone: () => void }) {
  const router = useRouter();
  const [methodId, setMethodId] = useState(line.paymentMethodId ?? "");
  const [paidDate, setPaidDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setError(null);
    if (!methodId) {
      setError("Choose a payment method.");
      return;
    }
    if (!paidDate) {
      setError("Enter the paid date.");
      return;
    }
    setPending(true);
    const res = await markPaid(line.id, { paymentMethodId: methodId, paidDate });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--page)" }}>
      <td className="p-3" colSpan={7}>
        <div className="flex flex-wrap items-end gap-3">
          <span style={{ fontSize: "var(--text-label)" }}>
            Pay <strong>{line.employeeName}</strong> — net {formatRM(line.netSen)}. This locks the line.
          </span>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
            <select className="h-11 rounded border px-2" style={fieldStyle} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">— choose —</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Paid date</span>
            <input type="date" className="h-11 rounded border px-3" style={fieldStyle} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={confirm}
            className="h-11 rounded-card px-4 font-medium"
            style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}
          >
            {pending ? "Marking…" : "Confirm paid"}
          </button>
          <button type="button" onClick={onDone} className="h-11 rounded-card px-4" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
        {error ? (
          <p className="mt-2" style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function Row({ line, methods }: { line: Line; methods: Method[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "pay">("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adjust() {
    setError(null);
    setPending(true);
    const res = await adjustLine(line.id);
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  if (mode === "edit") return <EditForm line={line} methods={methods} onDone={() => setMode("view")} />;
  if (mode === "pay") return <PayForm line={line} methods={methods} onDone={() => setMode("view")} />;

  // The unpaid-absence deduction always uses the fixed Employment Act
  // s.60I ordinary-rate divisor (26), never workingDaysInMonth — that
  // field is separate month context (calendar days minus rest days minus
  // public holidays) that happens to equal the raw calendar day count
  // whenever a month's attendance hasn't been marked yet, which is
  // exactly how this line could end up implying a deduction was computed
  // against "30 working days" when it never was. State the real basis.
  const basis =
    line.payType === "monthly"
      ? `Monthly · ${line.unpaidAbsenceDays} unpaid day${line.unpaidAbsenceDays === 1 ? "" : "s"} (1/${ORDINARY_RATE_DIVISOR} ordinary rate)`
      : `Daily · ${line.presentDays} days present`;

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="flex items-center gap-2">
            {line.employeeName}
            {line.directorRemuneration ? <Badge tone="brand">Director</Badge> : null}
            {line.isAdjustment ? <Badge tone="warn">Adjustment</Badge> : null}
          </span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            {line.position || "—"} · {basis}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 money">{formatRM(line.grossSen)}</td>
      <td className="px-4 py-3 money">
        <div className="flex flex-col">
          <span>{formatRM(line.totalDeductionsSen)}</span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
            {line.unpaidAbsenceDeductionSen > 0 ? `unpaid ${formatRM(line.unpaidAbsenceDeductionSen)} · ` : ""}
            {line.advanceRepaymentSen > 0 ? `advance ${formatRM(line.advanceRepaymentSen)} · ` : ""}
            {line.statutoryDeductionSen > 0 ? `statutory ${formatRM(line.statutoryDeductionSen)}` : ""}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 money" style={line.netSen < 0 ? { color: "var(--warn)" } : undefined}>
        {formatRM(line.netSen)}
        {line.netSen < 0 ? (
          <span className="block" style={{ fontSize: "var(--text-caption)" }}>over-deducted</span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        {line.status === "paid" ? (
          <div className="flex flex-col gap-1">
            <Badge tone="neutral">Paid</Badge>
            <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
              {line.paidDate} · {line.paymentMethodName ?? "—"}
            </span>
          </div>
        ) : (
          <Badge tone="muted">Draft</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex justify-end gap-3">
            <Link href={`/salary/${line.id}`} style={{ color: "var(--brand)" }}>
              Payslip
            </Link>
            {line.status === "draft" ? (
              <>
                <button type="button" onClick={() => setMode("edit")} style={{ color: "var(--brand)" }}>
                  Edit
                </button>
                <button type="button" onClick={() => setMode("pay")} style={{ color: "var(--brand)", fontWeight: 600 }}>
                  Pay
                </button>
              </>
            ) : !line.isAdjustment ? (
              <button type="button" disabled={pending} onClick={adjust} style={{ color: "var(--text-muted)" }}>
                {pending ? "…" : "Adjust"}
              </button>
            ) : null}
          </div>
          {error ? (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export default function SalaryRunManager({
  month,
  activeEmployeeCount,
  methods,
  lines,
}: {
  month: string;
  activeEmployeeCount: number;
  methods: Method[];
  lines: Line[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseLines = lines.filter((l) => !l.isAdjustment);
  const paidCount = baseLines.filter((l) => l.status === "paid").length;

  async function refresh() {
    setError(null);
    setMessage(null);
    setPending(true);
    const res = await refreshRun(month);
    setPending(false);
    if (res.ok) {
      const s = res.summary;
      setMessage(
        `${s.created} created, ${s.refreshed} refreshed${s.skippedPaid ? `, ${s.skippedPaid} paid left locked` : ""}.`,
      );
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  function changeMonth(m: string) {
    if (/^\d{4}-\d{2}$/.test(m)) router.push(`/salary?month=${m}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <FormPanel error={error} delayMs={0}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Month</span>
            <input
              type="month"
              className="h-11 rounded border px-3"
              style={fieldStyle}
              defaultValue={month}
              onChange={(e) => changeMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={refresh}
            className="btn-primary h-11 rounded-card px-4 font-medium"
            style={{ opacity: pending ? 0.7 : 1 }}
          >
            {pending ? "Working…" : lines.length ? "Refresh draft from attendance" : "Generate draft run"}
          </button>
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            {activeEmployeeCount} active employee{activeEmployeeCount === 1 ? "" : "s"} ·{" "}
            {baseLines.length} line{baseLines.length === 1 ? "" : "s"} · {paidCount} paid
          </span>
        </div>
        {message ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>{message}</p>
        ) : null}
      </FormPanel>

      <DataTable
        delayMs={40}
        columns={[
          { key: "employee", header: "Employee" },
          { key: "gross", header: "Gross", align: "right" },
          { key: "deductions", header: "Deductions", align: "right" },
          { key: "net", header: "Net", align: "right" },
          { key: "status", header: "Status" },
          { key: "actions", header: "" },
        ]}
        isEmpty={lines.length === 0}
        emptyMessage="No run for this month yet. Generate the draft to compute each active employee's pay from their attendance."
      >
        {lines.map((l) => (
          <Row key={l.id} line={l} methods={methods} />
        ))}
      </DataTable>
    </div>
  );
}
