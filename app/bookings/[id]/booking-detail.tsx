"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSen, fromSen, formatRM } from "@/lib/money";
import { formatBusinessDateLabel } from "@/lib/businessDate";
import { countryName } from "@/lib/countries";
import {
  summarisePayments,
  outstandingSen,
  PAYMENT_TYPES,
  BOOKING_STATUSES,
  CANCELLATION_STATUSES,
  type BookingSource,
  type BookingStatus,
  type CancellationStatus,
  type PaymentType,
} from "@/lib/bookings";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import FormPanel from "@/components/ui/form-panel";
import DataTable from "@/components/ui/data-table";
import Badge, { type BadgeTone } from "@/components/ui/badge";
import {
  recordPayment,
  changeBookingStatus,
  cancelBooking,
  editBookingPayment,
  deleteBookingPayment,
} from "../actions";

interface RoomLineView {
  roomType: string;
  roomsCount: number;
  ratePerNightSen: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  lineTotalSen: number;
}
interface BookingView {
  id: string;
  reference: string;
  guestName: string;
  guestIdNumber: string;
  nationality: string;
  email: string;
  phone: string;
  address: string;
  tin: string;
  checkIn: string;
  checkOut: string;
  totalRooms: number;
  roomNights: number;
  rooms: RoomLineView[];
  tourismTaxApplicable: boolean;
  tourismTaxPerRoomPerNightSen: number;
  tourismTaxOverrideReason: string;
  roomRevenueSen: number;
  tourismTaxSen: number;
  grandTotalSen: number;
  status: BookingStatus;
  source: BookingSource;
  notes: string;
  cancellation: CancellationView | null;
}
interface CancellationView {
  reason: string;
  cancelledByName: string;
  cancelledOn: string;
  bookingValueSen: number;
  depositHeldSen: number;
  refundedSen: number;
  forfeitedSen: number;
}
interface PaymentView {
  id: string;
  date: string;
  amountSen: number;
  type: PaymentType;
  paymentMethodId: string;
  methodName: string;
  reference: string;
  note: string;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  confirmed: "neutral",
  checked_in: "brand",
  checked_out: "muted",
  cancelled: "muted",
  no_show: "warn",
};
const SOURCE_LABELS: Record<BookingSource, string> = {
  direct_phone: "Direct — phone",
  walk_in: "Walk-in",
  email: "Email",
  ota: "OTA",
};
const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: "Deposit",
  part_payment: "Part payment",
  full: "Full payment",
  refund: "Refund",
};

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--text-label)" }}>{value || "—"}</span>
    </div>
  );
}

function parseAmt(s: string): number | null {
  if (s.trim() === "") return null;
  try {
    const sen = toSen(s);
    return sen > 0 ? sen : null;
  } catch {
    return null;
  }
}

function PaymentForm({
  bookingId,
  outstanding,
  paymentMethods,
  canManage,
}: {
  bookingId: string;
  outstanding: number;
  paymentMethods: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<PaymentType>("deposit");
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Reception may record payments but not refunds (brief §5) — hide the refund
  // option for them; the server enforces it regardless.
  const types = canManage
    ? PAYMENT_TYPES
    : PAYMENT_TYPES.filter((t) => t !== "refund");

  async function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Choose a payment date.");
    const amountSen = parseAmt(amount);
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    if (!methodId) return setError("Choose a payment method.");
    setPending(true);
    const res = await recordPayment({
      bookingId,
      date,
      amountSen,
      paymentMethodId: methodId,
      type,
      reference,
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
    <FormPanel title="Record a payment" error={error}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Date</span>
          <input
            aria-label="Payment date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Amount (RM)</span>
          <input
            aria-label="Payment amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="money h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Type</span>
          <select
            aria-label="Payment type"
            value={type}
            onChange={(e) => setType(e.target.value as PaymentType)}
            className="h-11 rounded border px-2"
            style={fieldStyle}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Payment method</span>
          <select
            aria-label="Payment method"
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            className="h-11 rounded border px-2"
            style={fieldStyle}
          >
            {paymentMethods.length === 0 ? <option value="">No payment methods</option> : null}
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference (optional)</span>
          <input
            aria-label="Payment reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Note (optional)</span>
          <input
            aria-label="Payment note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Outstanding: {formatRM(outstanding)}. Cash taken here stays in the booking
          ledger — it does not post to the night-report drawer.
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="btn-primary h-11 rounded-card px-4 font-medium"
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Recording…" : "Record payment"}
        </button>
      </div>
    </FormPanel>
  );
}

function StatusControls({
  bookingId,
  status,
  depositHeldSen,
  paymentMethods,
}: {
  bookingId: string;
  status: BookingStatus;
  depositHeldSen: number;
  paymentMethods: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<CancellationStatus | null>(null);

  async function change(next: BookingStatus) {
    setError(null);
    setPending(next);
    const res = await changeBookingStatus(bookingId, next);
    setPending(null);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  // Only non-cancellation statuses are plain buttons; cancel / no-show go
  // through the form (reason + deposit disposition required).
  const plainOptions = BOOKING_STATUSES.filter(
    (s) => s !== status && !(CANCELLATION_STATUSES as readonly string[]).includes(s),
  ) as BookingStatus[];

  if (cancelling) {
    return (
      <CancelForm
        bookingId={bookingId}
        status={cancelling}
        depositHeldSen={depositHeldSen}
        paymentMethods={paymentMethods}
        onDone={() => setCancelling(null)}
      />
    );
  }

  return (
    <Card flat className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Change status</span>
        <div className="flex flex-wrap gap-2">
          {plainOptions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending !== null}
              onClick={() => change(s)}
              className="h-9 rounded-card border px-3"
              style={{
                borderColor: "var(--border-strong)",
                color: "var(--brand)",
                fontSize: "var(--text-label)",
                opacity: pending === s ? 0.6 : 1,
              }}
            >
              {pending === s ? "…" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {error ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => setCancelling("cancelled")}
          className="h-9 rounded-card border px-3"
          style={{ borderColor: "var(--warn)", color: "var(--warn)", fontSize: "var(--text-label)" }}
        >
          Cancel booking
        </button>
        <button
          type="button"
          onClick={() => setCancelling("no_show")}
          className="h-9 rounded-card border px-3"
          style={{ borderColor: "var(--warn)", color: "var(--warn)", fontSize: "var(--text-label)" }}
        >
          Mark no-show
        </button>
      </div>
    </Card>
  );
}

type Disposition = "refund" | "forfeit" | "partial";

function CancelForm({
  bookingId,
  status,
  depositHeldSen,
  paymentMethods,
  onDone,
}: {
  bookingId: string;
  status: CancellationStatus;
  depositHeldSen: number;
  paymentMethods: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const held = Math.max(0, depositHeldSen);
  const [reason, setReason] = useState("");
  // No-show usually forfeits; cancellation may not — but the person always
  // chooses. Seed a sensible default disposition per status; never auto-apply.
  const [disposition, setDisposition] = useState<Disposition>(
    status === "no_show" ? "forfeit" : "refund",
  );
  const [refundAmount, setRefundAmount] = useState(held > 0 ? fromSen(held) : "");
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The refunded portion implied by the disposition.
  let refundedSen = 0;
  if (held > 0) {
    if (disposition === "refund") refundedSen = held;
    else if (disposition === "forfeit") refundedSen = 0;
    else refundedSen = parseAmt(refundAmount) ?? -1; // partial
  }
  const forfeitedSen = refundedSen >= 0 ? held - refundedSen : 0;
  const needsMethod = refundedSen > 0;

  async function submit() {
    setError(null);
    if (!reason.trim()) return setError("Enter a reason.");
    if (held > 0) {
      if (refundedSen < 0) return setError("Enter a valid refund amount.");
      if (refundedSen > held)
        return setError(`Refund can't exceed the deposit held (${formatRM(held)}).`);
      if (needsMethod && !methodId) return setError("Choose a refund payment method.");
    }
    setPending(true);
    const res = await cancelBooking({
      bookingId,
      status,
      reason: reason.trim(),
      refundedSen: held > 0 ? refundedSen : 0,
      refundPaymentMethodId: needsMethod ? methodId : "",
      refundReference: needsMethod ? reference.trim() : "",
    });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      setError(res.error);
    }
  }

  const label = status === "no_show" ? "Mark no-show" : "Cancel booking";

  return (
    <Card flat className="flex flex-col gap-3 p-3">
      <span style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--warn)" }}>
        {label}
      </span>
      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
        The booking stays in the system (never deleted). Its room-nights stop
        accruing and its rooms leave the rooms-sold count.
      </p>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          Reason (required)
        </span>
        <textarea
          aria-label="Cancellation reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-card border p-2"
          style={{
            ...fieldStyle,
            borderColor: reason.trim() ? "var(--border-strong)" : "var(--warn)",
          }}
        />
      </label>

      {held > 0 ? (
        <div className="flex flex-col gap-2">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Deposit held: <span className="money">{formatRM(held)}</span> — how is it handled?
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Deposit disposition">
            {(
              [
                ["refund", "Refund in full"],
                ["forfeit", "Forfeit"],
                ["partial", "Partial"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDisposition(value)}
                className="h-9 rounded-card border px-3"
                style={{
                  borderColor: disposition === value ? "var(--brand)" : "var(--border-strong)",
                  background: disposition === value ? "var(--brand-tint)" : "var(--surface)",
                  color: disposition === value ? "var(--brand)" : "var(--text-muted)",
                  fontSize: "var(--text-label)",
                  fontWeight: disposition === value ? 600 : undefined,
                }}
              >
                {text}
              </button>
            ))}
          </div>
          {disposition === "partial" ? (
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                Refund amount (RM) — the rest is forfeited
              </span>
              <input
                aria-label="Refund amount"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="money h-11 w-40 rounded border px-3"
                style={fieldStyle}
              />
            </label>
          ) : null}
          <div className="flex justify-between" style={{ fontSize: "var(--text-label)" }}>
            <span style={{ color: "var(--text-muted)" }}>Refund</span>
            <span className="money">{formatRM(refundedSen >= 0 ? refundedSen : 0)}</span>
          </div>
          <div className="flex justify-between" style={{ fontSize: "var(--text-label)" }}>
            <span style={{ color: "var(--text-muted)" }}>Forfeit (becomes revenue)</span>
            <span className="money">{formatRM(forfeitedSen)}</span>
          </div>
          {needsMethod ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Refund via</span>
                <select
                  aria-label="Refund payment method"
                  value={methodId}
                  onChange={(e) => setMethodId(e.target.value)}
                  className="h-11 rounded border px-2"
                  style={fieldStyle}
                >
                  {paymentMethods.length === 0 ? <option value="">No methods</option> : null}
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Reference (optional)</span>
                <input
                  aria-label="Refund reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-11 rounded border px-3"
                  style={fieldStyle}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          No deposit held — nothing to refund or forfeit.
        </p>
      )}

      {error ? (
        <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="h-11 rounded-card px-4 font-medium"
          style={{ background: "var(--warn)", color: "#fff", opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Working…" : label}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-11 rounded-card border px-4"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
        >
          Back
        </button>
      </div>
    </Card>
  );
}

const PAYMENT_COLS = 6;

function PaymentRow({
  payment,
  bookingId,
  paymentMethods,
  canManage,
}: {
  payment: PaymentView;
  bookingId: string;
  paymentMethods: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [date, setDate] = useState(payment.date);
  const [type, setType] = useState<PaymentType>(payment.type);
  const [methodId, setMethodId] = useState(payment.paymentMethodId);
  const [amount, setAmount] = useState(fromSen(payment.amountSen));
  const [reference, setReference] = useState(payment.reference);
  const [note, setNote] = useState(payment.note);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setError(null);
    const amountSen = parseAmt(amount);
    if (amountSen === null) return setError("Enter an amount greater than zero.");
    setPending(true);
    const res = await editBookingPayment(payment.id, {
      bookingId, date, amountSen, paymentMethodId: methodId, type, reference, note,
    });
    setPending(false);
    if (res.ok) { router.refresh(); setMode("view"); } else { setError(res.error); }
  }

  async function confirmDelete() {
    setError(null);
    if (!reason.trim()) return setError("Enter a reason.");
    setPending(true);
    const res = await deleteBookingPayment(payment.id, reason.trim());
    setPending(false);
    if (res.ok) { router.refresh(); setMode("view"); } else { setError(res.error); }
  }

  if (mode === "edit") {
    return (
      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--page)" }}>
        <td className="px-4 py-3" colSpan={PAYMENT_COLS}>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <input aria-label="Edit payment date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
              <select aria-label="Edit payment type" value={type} onChange={(e) => setType(e.target.value as PaymentType)} className="h-9 rounded border px-2" style={fieldStyle}>
                {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</option>)}
              </select>
              <input aria-label="Edit payment amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="money h-9 rounded border px-2" style={fieldStyle} />
              <select aria-label="Edit payment method" value={methodId} onChange={(e) => setMethodId(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle}>
                {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input aria-label="Edit payment reference" placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
              <input aria-label="Edit payment note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 rounded border px-2" style={fieldStyle} />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" disabled={pending} onClick={save} style={{ color: "var(--brand)", fontWeight: 600 }}>{pending ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setMode("view")} style={{ color: "var(--text-muted)" }}>Cancel</button>
              {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
            </div>
          </div>
        </td>
      </tr>
    );
  }
  if (mode === "delete") {
    return (
      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--warn-bg)" }}>
        <td className="px-4 py-3" colSpan={PAYMENT_COLS}>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ fontSize: "var(--text-label)" }}>Delete this {formatRM(payment.amountSen)} payment? Reason:</span>
            <input aria-label="Delete payment reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 flex-1 rounded border px-2" style={{ ...fieldStyle, minWidth: 160 }} />
            <button type="button" disabled={pending} onClick={confirmDelete} style={{ color: "var(--warn)", fontWeight: 600 }}>{pending ? "Deleting…" : "Confirm delete"}</button>
            <button type="button" onClick={() => setMode("view")} style={{ color: "var(--text-muted)" }}>Cancel</button>
            {error ? <span style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</span> : null}
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3">{payment.date}</td>
      <td className="px-4 py-3">{PAYMENT_TYPE_LABELS[payment.type]}</td>
      <td className="px-4 py-3">{payment.methodName}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{payment.reference || "—"}</td>
      <td className="px-4 py-3 money">
        {payment.type === "refund" ? (
          <span className="money-out">-{formatRM(payment.amountSen)}</span>
        ) : (
          <span className="money-in">{formatRM(payment.amountSen)}</span>
        )}
      </td>
      {canManage ? (
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setMode("edit")} style={{ color: "var(--brand)" }}>Edit</button>
            <button type="button" onClick={() => setMode("delete")} style={{ color: "var(--text-muted)" }}>Delete</button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

export default function BookingDetail({
  booking,
  payments,
  paymentMethods,
  canManage,
}: {
  booking: BookingView;
  payments: PaymentView[];
  paymentMethods: { id: string; name: string }[];
  canManage: boolean;
}) {
  const summary = useMemo(() => summarisePayments(payments), [payments]);
  const outstanding = outstandingSen(booking.grandTotalSen, payments);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={booking.reference}
        description={`${booking.guestName} · ${formatBusinessDateLabel(booking.checkIn)} → ${formatBusinessDateLabel(booking.checkOut)} · ${booking.totalRooms} room${booking.totalRooms === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[booking.status]} variant="solid">
              {STATUS_LABELS[booking.status]}
            </Badge>
            <Link
              href={`/bookings/${booking.id}/letter`}
              className="flex h-11 items-center rounded-card border px-4"
              style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
            >
              Letter
            </Link>
            {canManage ? (
              <Link
                href={`/bookings/${booking.id}/edit`}
                className="flex h-11 items-center rounded-card border px-4"
                style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
              >
                Edit
              </Link>
            ) : null}
          </div>
        }
        animate
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Guest</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Passport / IC" value={booking.guestIdNumber} />
              <Detail
                label="Nationality"
                value={booking.nationality ? countryName(booking.nationality) : ""}
              />
              <Detail label="Phone" value={booking.phone} />
              <Detail label="Email" value={booking.email} />
              <Detail label="TIN" value={booking.tin} />
              <Detail label="Source" value={SOURCE_LABELS[booking.source]} />
            </div>
            {booking.address ? <Detail label="Address" value={booking.address} /> : null}
            {booking.notes ? <Detail label="Notes" value={booking.notes} /> : null}
          </Card>

          <Card className="flex flex-col gap-2 p-0">
            <h2 className="px-4 pt-4" style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
              Rooms
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                    <th className="px-4 py-2 text-left">Room type</th>
                    <th className="px-4 py-2 text-right">Rooms</th>
                    <th className="px-4 py-2 text-left">Dates</th>
                    <th className="px-4 py-2 text-right">Nights</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.rooms.map((l, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-2">{l.roomType || "Room"}</td>
                      <td className="px-4 py-2 money text-right">{l.roomsCount}</td>
                      <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                        {l.checkIn} → {l.checkOut}
                      </td>
                      <td className="px-4 py-2 money text-right">{l.nights}</td>
                      <td className="px-4 py-2 money text-right">{formatRM(l.ratePerNightSen)}</td>
                      <td className="px-4 py-2 money text-right">{formatRM(l.lineTotalSen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <PaymentForm
            bookingId={booking.id}
            outstanding={outstanding}
            paymentMethods={paymentMethods}
            canManage={canManage}
          />

          <DataTable
            columns={[
              { key: "date", header: "Date" },
              { key: "type", header: "Type" },
              { key: "method", header: "Method" },
              { key: "ref", header: "Reference" },
              { key: "amount", header: "Amount", align: "right" },
              ...(canManage ? [{ key: "actions", header: "" }] : []),
            ]}
            isEmpty={payments.length === 0}
            emptyMessage="No payments recorded yet."
          >
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                bookingId={booking.id}
                paymentMethods={paymentMethods}
                canManage={canManage}
              />
            ))}
          </DataTable>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <Card className="flex flex-col gap-3 p-4">
            <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Billing</h2>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-muted)" }}>Room revenue</span>
              <span className="money">{formatRM(booking.roomRevenueSen)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-muted)" }}>Tourism tax</span>
              <span className="money">{formatRM(booking.tourismTaxSen)}</span>
            </div>
            {booking.tourismTaxOverrideReason ? (
              <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>
                Tax overridden: {booking.tourismTaxOverrideReason}
              </p>
            ) : null}
            <div
              className="flex items-center justify-between"
              style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}
            >
              <span style={{ fontWeight: 600 }}>Total</span>
              <span className="money" style={{ fontWeight: 600 }}>{formatRM(booking.grandTotalSen)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--text-muted)" }}>Paid</span>
              <span className="money money-in">{formatRM(summary.netPaidSen)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontWeight: 600 }}>Outstanding</span>
              <span className="money" style={{ fontWeight: 600 }}>
                {outstanding > 0 ? (
                  <span className="money-out">{formatRM(outstanding)}</span>
                ) : (
                  formatRM(outstanding)
                )}
              </span>
            </div>
          </Card>

          {booking.cancellation ? (
            <Card flat className="flex flex-col gap-2 p-4" style={{ background: "var(--warn-bg)" }}>
              <span style={{ fontSize: "var(--text-label)", fontWeight: 600, color: "var(--warn)" }}>
                {booking.status === "no_show" ? "No-show" : "Cancelled"}
              </span>
              <p style={{ fontSize: "var(--text-label)" }}>{booking.cancellation.reason}</p>
              <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
                by {booking.cancellation.cancelledByName} on {booking.cancellation.cancelledOn}
              </p>
              {booking.cancellation.depositHeldSen > 0 ? (
                <div className="flex flex-col gap-1" style={{ fontSize: "var(--text-label)" }}>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Deposit refunded</span>
                    <span className="money">{formatRM(booking.cancellation.refundedSen)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Deposit forfeited (revenue)</span>
                    <span className="money">{formatRM(booking.cancellation.forfeitedSen)}</span>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}

          {canManage && !booking.cancellation ? (
            <StatusControls
              bookingId={booking.id}
              status={booking.status}
              depositHeldSen={summary.netPaidSen}
              paymentMethods={paymentMethods}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
