"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM, MoneyError } from "@/lib/money";
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
  paymentMethodType: string;
  receivedFrom: string;
  reference: string;
  note: string;
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

function toLedgerLine(e: RevenueRow): StandaloneLedgerLine {
  return {
    id: e.id,
    date: e.date,
    category: e.categoryName,
    note: e.note,
    counterparty: e.receivedFrom,
    paymentMethod: e.paymentMethodName,
    paymentMethodType: e.paymentMethodType,
    amountSen: e.amountSen,
    enteredBy: e.enteredBy,
  };
}

// ---------------------------------------------------------------------------
// Add revenue entry form
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

// ---------------------------------------------------------------------------
// Edit / delete rows
// ---------------------------------------------------------------------------

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
      <td className="px-3 py-3" colSpan={COLUMNS}>
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

  return (
    <tr className="table-row-hover" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-3 py-2">{entry.date}</td>
      <td className="px-3 py-2">{entry.categoryName}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{entry.note || "—"}</td>
      <td className="px-3 py-2">{entry.receivedFrom || "—"}</td>
      <td className="px-3 py-2">{entry.paymentMethodName}</td>
      <td className="px-3 py-2 money text-right">{formatRM(entry.amountSen)}</td>
      <td className="px-3 py-2">{entry.enteredBy}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setMode("edit")} style={{ color: "var(--brand)" }}>Edit</button>
          <button type="button" onClick={() => setMode("delete")} style={{ color: "var(--text-muted)" }}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

function DeletedRow({ entry }: { entry: RevenueRow }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.55 }}>
      <td className="px-3 py-2">{entry.date}</td>
      <td className="px-3 py-2">{entry.categoryName}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{entry.note || "—"}</td>
      <td className="px-3 py-2">{entry.receivedFrom || "—"}</td>
      <td className="px-3 py-2">{entry.paymentMethodName}</td>
      <td className="px-3 py-2 money text-right">{formatRM(entry.amountSen)}</td>
      <td className="px-3 py-2">{entry.enteredBy}</td>
      <td className="px-3 py-2">
        <Badge tone="muted">Deleted</Badge>
        {entry.deletedReason ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}> · {entry.deletedReason}</span>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Filter bar + summary + day-by-day list
// ---------------------------------------------------------------------------

function RevenueWorkspace({
  entries,
  categories,
  paymentMethods,
  showDeleted,
  deletedEntries,
  rangeFrom,
  rangeTo,
  frontDeskRevenueSen,
}: {
  entries: RevenueRow[];
  categories: Option[];
  paymentMethods: Option[];
  showDeleted: boolean;
  deletedEntries: RevenueRow[];
  rangeFrom: string;
  rangeTo: string;
  frontDeskRevenueSen: number;
}) {
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [minAmountInput, setMinAmountInput] = useState("");

  const lines = useMemo(() => entries.map(toLedgerLine), [entries]);
  const rowById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

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
  const standaloneTotalSen = standaloneLedgerGrandTotalSen(filteredLines);
  const channelSummary = standaloneChannelSummary(filteredLines);

  function clearFilters() {
    setCategory("");
    setPaymentMethod("");
    setMinAmountInput("");
  }

  return (
    <div className="flex flex-col gap-4">
      <EntrySummaryCards
        totalSen={standaloneTotalSen}
        entryCount={filteredLines.length}
        channelSummary={channelSummary}
        tone="revenue"
        extraLines={[
          { label: "Front desk (night reports)", amountSen: frontDeskRevenueSen },
          { label: "Standalone (this page)", amountSen: standaloneTotalSen },
        ]}
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
          href={showDeleted ? `/revenue?from=${rangeFrom}&to=${rangeTo}` : `/revenue?from=${rangeFrom}&to=${rangeTo}&deleted=1`}
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
          { key: "from", header: "Received from" },
          { key: "method", header: "Payment method" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "enteredBy", header: "Entered by" },
          { key: "actions", header: "" },
        ]}
        isEmpty={filteredLines.length === 0}
        emptyMessage="No standalone revenue entries match this range and filters."
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
              <Row key={l.id} entry={rowById.get(l.id)!} categories={categories} paymentMethods={paymentMethods} />
            ))}
          </Fragment>
        ))}
        {filteredLines.length > 0 ? (
          <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-strong)" }}>
            <td colSpan={5} className="px-3 py-3">Grand total</td>
            <td className="px-3 py-3 money text-right">{formatRM(standaloneTotalSen)}</td>
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
            { key: "from", header: "Received from" },
            { key: "method", header: "Payment method" },
            { key: "amount", header: "Amount", align: "right" },
            { key: "enteredBy", header: "Entered by" },
            { key: "status", header: "" },
          ]}
          isEmpty={deletedEntries.length === 0}
          emptyMessage="No deleted entries in this range."
        >
          {deletedEntries.map((e) => <DeletedRow key={e.id} entry={e} />)}
        </DataTable>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function RevenueManager({
  entries,
  deletedEntries,
  categories,
  paymentMethods,
  currentDate,
  rangeFrom,
  rangeTo,
  showDeleted,
  frontDeskRevenueSen,
}: {
  entries: RevenueRow[];
  deletedEntries: RevenueRow[];
  categories: Option[];
  paymentMethods: Option[];
  currentDate: string;
  rangeFrom: string;
  rangeTo: string;
  showDeleted: boolean;
  frontDeskRevenueSen: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AddForm categories={categories} paymentMethods={paymentMethods} currentDate={currentDate} />
      <RevenueWorkspace
        entries={entries}
        deletedEntries={deletedEntries}
        categories={categories}
        paymentMethods={paymentMethods}
        showDeleted={showDeleted}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        frontDeskRevenueSen={frontDeskRevenueSen}
      />
    </div>
  );
}
