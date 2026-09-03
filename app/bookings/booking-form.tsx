"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toSen, formatRM } from "@/lib/money";
import {
  bookingTotals,
  roomLineTotals,
  tourismTaxDefaultApplies,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  type BookingSource,
  type BookingStatus,
} from "@/lib/bookings";
import FormPanel from "@/components/ui/form-panel";
import CountrySelect from "@/components/ui/country-select";
import { createBooking, editBooking } from "./actions";

export interface RoomLineValues {
  id: number;
  roomType: string;
  roomsCount: string; // int text
  rate: string; // RM text
  /** When off, this line uses the booking's dates; when on, its own (so one
   * room can leave early). Kept off for the common single-room case. */
  overrideDates: boolean;
  checkIn: string;
  checkOut: string;
}

export interface BookingFormValues {
  guestName: string;
  guestIdNumber: string;
  nationality: string;
  email: string;
  phone: string;
  address: string;
  tin: string;
  checkIn: string; // booking-level span
  checkOut: string;
  rooms: RoomLineValues[];
  tourismTaxApplicable: boolean;
  tourismTaxRate: string; // RM text, per room per night
  tourismTaxOverrideReason: string;
  status: BookingStatus;
  source: BookingSource;
  notes: string;
}

const SOURCE_LABELS: Record<BookingSource, string> = {
  direct_phone: "Direct — phone",
  walk_in: "Walk-in",
  email: "Email",
  ota: "OTA",
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Empty parses to 0; unparseable to null. */
function parseAmt(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    return toSen(s);
  } catch {
    return null;
  }
}
function amt(s: string): number {
  const v = parseAmt(s);
  return v === null || v < 0 ? 0 : v;
}
function parseRoomsCount(s: string): number {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 ? n : NaN;
}

/** The dates a line effectively uses: its own when overridden, else the
 * booking's. */
function effectiveDates(line: RoomLineValues, booking: { checkIn: string; checkOut: string }) {
  return line.overrideDates
    ? { checkIn: line.checkIn, checkOut: line.checkOut }
    : { checkIn: booking.checkIn, checkOut: booking.checkOut };
}

/** Replace an empty/invalid date with a zero-night placeholder so the live
 * preview never throws while the user is still typing dates. */
function safeDate(s: string): string {
  return DATE_RE.test(s) ? s : "2000-01-01";
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  type = "text",
  money = false,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  type?: string;
  money?: boolean;
}) {
  return (
    <input
      aria-label={ariaLabel}
      type={type}
      inputMode={money ? "decimal" : undefined}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-11 rounded border px-3 ${money ? "money" : ""}`}
      style={fieldStyle}
    />
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text)" }}>{label}</span>
      <span className="money" style={{ fontWeight: strong ? 600 : 400 }}>
        {value}
      </span>
    </div>
  );
}

function RoomLineCard({
  line,
  index,
  canRemove,
  booking,
  onChange,
  onRemove,
}: {
  line: RoomLineValues;
  index: number;
  canRemove: boolean;
  booking: { checkIn: string; checkOut: string };
  onChange: (patch: Partial<RoomLineValues>) => void;
  onRemove: () => void;
}) {
  const eff = effectiveDates(line, booking);
  const preview = roomLineTotals({
    roomsCount: parseRoomsCount(line.roomsCount) || 0,
    ratePerNightSen: amt(line.rate),
    checkIn: safeDate(eff.checkIn),
    checkOut: safeDate(eff.checkOut),
  });

  return (
    <div
      className="flex flex-col gap-3 rounded-card border p-3"
      style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>
          Room {index + 1}
        </span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Room type">
          <TextInput
            ariaLabel={`Room ${index + 1} type`}
            value={line.roomType}
            onChange={(x) => onChange({ roomType: x })}
            placeholder="e.g. Standard Twin"
          />
        </Field>
        <Field label="Number of rooms">
          <input
            aria-label={`Room ${index + 1} count`}
            inputMode="numeric"
            value={line.roomsCount}
            onChange={(e) => onChange({ roomsCount: e.target.value.replace(/[^\d]/g, "") })}
            className="money h-11 w-full rounded border px-3"
            style={fieldStyle}
          />
        </Field>
        <Field label="Rate per night (RM)">
          <TextInput
            ariaLabel={`Room ${index + 1} rate`}
            money
            value={line.rate}
            onChange={(x) => onChange({ rate: x })}
            placeholder="0.00"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Room ${index + 1} has different dates`}
          checked={line.overrideDates}
          onChange={(e) =>
            onChange({
              overrideDates: e.target.checked,
              // Seed the line's own dates from the booking's when first enabled.
              checkIn: e.target.checked && !line.checkIn ? booking.checkIn : line.checkIn,
              checkOut: e.target.checked && !line.checkOut ? booking.checkOut : line.checkOut,
            })
          }
        />
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          This room has different dates (e.g. leaves early)
        </span>
      </label>
      {line.overrideDates ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room check-in">
            <TextInput
              ariaLabel={`Room ${index + 1} check-in`}
              type="date"
              value={line.checkIn}
              onChange={(x) => onChange({ checkIn: x })}
            />
          </Field>
          <Field label="Room check-out">
            <TextInput
              ariaLabel={`Room ${index + 1} check-out`}
              type="date"
              value={line.checkOut}
              onChange={(x) => onChange({ checkOut: x })}
            />
          </Field>
        </div>
      ) : null}

      <div
        className="flex items-center justify-between"
        style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
      >
        <span>
          {preview.nights} night{preview.nights === 1 ? "" : "s"} ×{" "}
          {parseRoomsCount(line.roomsCount) || 0} room
          {(parseRoomsCount(line.roomsCount) || 0) === 1 ? "" : "s"}
        </span>
        <span className="money">{formatRM(preview.lineTotalSen)}</span>
      </div>
    </div>
  );
}

export default function BookingForm({
  mode,
  bookingId,
  initial,
  canSetStatus,
}: {
  mode: "new" | "edit";
  bookingId?: string;
  initial: BookingFormValues;
  canSetStatus: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<BookingFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nextId = useState(() => ({ current: Math.max(0, ...initial.rooms.map((r) => r.id)) + 1 }))[0];

  const set = <K extends keyof BookingFormValues>(k: K, val: BookingFormValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  // Changing nationality re-derives the tourism-tax default (Malaysian → off,
  // foreign → on) and clears any override reason, so the tax treatment always
  // starts from the right default; the user can then override with a reason.
  function setNationality(code: string) {
    setV((s) => ({
      ...s,
      nationality: code,
      tourismTaxApplicable: tourismTaxDefaultApplies(code),
      tourismTaxOverrideReason: "",
    }));
  }

  const taxDefault = tourismTaxDefaultApplies(v.nationality);
  const taxOverridden = v.tourismTaxApplicable !== taxDefault;

  function patchLine(id: number, patch: Partial<RoomLineValues>) {
    setV((s) => ({
      ...s,
      rooms: s.rooms.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }
  function addLine() {
    setV((s) => ({
      ...s,
      rooms: [
        ...s.rooms,
        {
          id: nextId.current++,
          roomType: "",
          roomsCount: "1",
          rate: "",
          overrideDates: false,
          checkIn: "",
          checkOut: "",
        },
      ],
    }));
  }
  function removeLine(id: number) {
    setV((s) => ({ ...s, rooms: s.rooms.filter((l) => l.id !== id) }));
  }

  const totals = useMemo(() => {
    return bookingTotals({
      rooms: v.rooms.map((l) => {
        const eff = effectiveDates(l, v);
        return {
          roomsCount: parseRoomsCount(l.roomsCount) || 0,
          ratePerNightSen: amt(l.rate),
          checkIn: safeDate(eff.checkIn),
          checkOut: safeDate(eff.checkOut),
        };
      }),
      tourismTaxApplicable: v.tourismTaxApplicable,
      tourismTaxPerRoomPerNightSen: amt(v.tourismTaxRate),
      status: v.status,
    });
  }, [v]);

  async function submit() {
    setError(null);

    if (!v.guestName.trim()) return setError("Enter the guest's name.");
    if (!v.guestIdNumber.trim())
      return setError("Enter the guest's passport or IC number.");
    if (!v.nationality) return setError("Choose the guest's country.");
    if (!DATE_RE.test(v.checkIn)) return setError("Choose a check-in date.");
    if (!DATE_RE.test(v.checkOut)) return setError("Choose a check-out date.");
    if (v.checkOut <= v.checkIn) return setError("Check-out must be after check-in.");
    if (v.rooms.length === 0) return setError("Add at least one room.");

    const rooms = [];
    for (let i = 0; i < v.rooms.length; i++) {
      const l = v.rooms[i];
      const count = parseRoomsCount(l.roomsCount);
      if (Number.isNaN(count)) return setError(`Room ${i + 1}: number of rooms must be at least 1.`);
      if (parseAmt(l.rate) === null || amt(l.rate) < 0)
        return setError(`Room ${i + 1}: enter a valid rate per night.`);
      const eff = effectiveDates(l, v);
      if (!DATE_RE.test(eff.checkIn) || !DATE_RE.test(eff.checkOut))
        return setError(`Room ${i + 1}: choose valid dates.`);
      if (eff.checkOut <= eff.checkIn)
        return setError(`Room ${i + 1}: check-out must be after check-in.`);
      rooms.push({
        roomType: l.roomType.trim(),
        roomsCount: count,
        ratePerNightSen: amt(l.rate),
        checkIn: eff.checkIn,
        checkOut: eff.checkOut,
      });
    }
    if (v.tourismTaxApplicable && parseAmt(v.tourismTaxRate) === null)
      return setError("Enter a valid tourism tax rate, or turn tourism tax off.");
    if (taxOverridden && !v.tourismTaxOverrideReason.trim())
      return setError(
        "Tourism tax was changed from the default for this nationality — enter a short reason.",
      );

    const payload = {
      guestName: v.guestName.trim(),
      guestIdNumber: v.guestIdNumber.trim(),
      nationality: v.nationality.trim(),
      email: v.email.trim(),
      phone: v.phone.trim(),
      address: v.address.trim(),
      tin: v.tin.trim(),
      checkIn: v.checkIn,
      checkOut: v.checkOut,
      rooms,
      tourismTaxApplicable: v.tourismTaxApplicable,
      tourismTaxPerRoomPerNightSen: v.tourismTaxApplicable ? amt(v.tourismTaxRate) : 0,
      tourismTaxOverrideReason: taxOverridden ? v.tourismTaxOverrideReason.trim() : "",
      status: v.status,
      source: v.source,
      notes: v.notes.trim(),
    };

    setPending(true);
    try {
      if (mode === "new") {
        const res = await createBooking(payload);
        if (res.ok) {
          router.push(`/bookings/${res.id}`);
          router.refresh();
        } else {
          setError(res.error);
          setPending(false);
        }
      } else {
        const res = await editBooking(bookingId!, payload);
        if (res.ok) {
          router.push(`/bookings/${bookingId}`);
          router.refresh();
        } else {
          setError(res.error);
          setPending(false);
        }
      }
    } catch {
      setError("Couldn't save — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormPanel title="Guest">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" wide>
            <TextInput ariaLabel="Guest name" value={v.guestName} onChange={(x) => set("guestName", x)} />
          </Field>
          <Field label="Passport / IC (required)">
            <TextInput ariaLabel="Passport or IC" value={v.guestIdNumber} onChange={(x) => set("guestIdNumber", x)} />
          </Field>
          <Field label="Nationality">
            <CountrySelect
              ariaLabel="Nationality"
              value={v.nationality}
              onChange={setNationality}
            />
          </Field>
          <Field label="Phone">
            <TextInput ariaLabel="Phone" value={v.phone} onChange={(x) => set("phone", x)} />
          </Field>
          <Field label="Email">
            <TextInput ariaLabel="Email" type="email" value={v.email} onChange={(x) => set("email", x)} />
          </Field>
          <Field label="Address" wide>
            <TextInput ariaLabel="Address" value={v.address} onChange={(x) => set("address", x)} />
          </Field>
          <Field label="TIN (tax identification, for e-Invoice)">
            <TextInput ariaLabel="TIN" value={v.tin} onChange={(x) => set("tin", x)} />
          </Field>
        </div>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Capture TIN and full address now even though e-Invoice isn&apos;t submitted yet —
          chasing a guest for them after checkout is a bad afternoon.
        </p>
      </FormPanel>

      <FormPanel title="Stay">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Check-in">
            <TextInput ariaLabel="Check-in" type="date" value={v.checkIn} onChange={(x) => set("checkIn", x)} />
          </Field>
          <Field label="Check-out">
            <TextInput ariaLabel="Check-out" type="date" value={v.checkOut} onChange={(x) => set("checkOut", x)} />
          </Field>
          <Field label="Source">
            <select
              aria-label="Source"
              value={v.source}
              onChange={(e) => set("source", e.target.value as BookingSource)}
              className="h-11 rounded border px-2"
              style={fieldStyle}
            >
              {BOOKING_SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          {canSetStatus ? (
            <Field label="Status">
              <select
                aria-label="Status"
                value={v.status}
                onChange={(e) => set("status", e.target.value as BookingStatus)}
                className="h-11 rounded border px-2"
                style={fieldStyle}
              >
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Rooms below default to these dates. Tick a room&apos;s &ldquo;different dates&rdquo;
          if it leaves early.
        </p>
      </FormPanel>

      <FormPanel title="Rooms">
        {v.rooms.map((line, i) => (
          <RoomLineCard
            key={line.id}
            line={line}
            index={i}
            canRemove={v.rooms.length > 1}
            booking={{ checkIn: v.checkIn, checkOut: v.checkOut }}
            onChange={(patch) => patchLine(line.id, patch)}
            onRemove={() => removeLine(line.id)}
          />
        ))}
        <button
          type="button"
          onClick={addLine}
          className="h-11 self-start rounded-card border px-4"
          style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
        >
          + Add another room
        </button>
      </FormPanel>

      <FormPanel title="Tourism tax">
        <p style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          {taxDefault
            ? "Foreign guest — tourism tax applies by default."
            : "Malaysian guest — tourism tax does not apply by default."}
        </p>
        <Field label="Tourism tax per room per night (RM)">
          <div className="flex items-center gap-2">
            <input
              aria-label="Tourism tax applicable"
              type="checkbox"
              checked={v.tourismTaxApplicable}
              onChange={(e) => set("tourismTaxApplicable", e.target.checked)}
            />
            <input
              aria-label="Tourism tax rate"
              inputMode="decimal"
              value={v.tourismTaxRate}
              disabled={!v.tourismTaxApplicable}
              onChange={(e) => set("tourismTaxRate", e.target.value)}
              className="money h-11 w-40 rounded border px-3"
              style={{ ...fieldStyle, opacity: v.tourismTaxApplicable ? 1 : 0.5 }}
            />
          </div>
        </Field>
        {taxOverridden ? (
          <Field label="Reason for overriding the default (required)">
            <input
              aria-label="Tourism tax override reason"
              value={v.tourismTaxOverrideReason}
              onChange={(e) => set("tourismTaxOverrideReason", e.target.value)}
              placeholder="e.g. Malaysian permanent resident — exempt"
              className="h-11 w-full rounded border px-3"
              style={{
                ...fieldStyle,
                borderColor: v.tourismTaxOverrideReason.trim()
                  ? "var(--border-strong)"
                  : "var(--warn)",
              }}
            />
          </Field>
        ) : null}
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          RM 10 per room per night for foreign guests, collected for the government — a
          liability, never revenue. Charged across all rooms: {totals.roomNights} room-nights.
        </p>
        <div className="flex flex-col gap-2 rounded-card p-3" style={{ background: "var(--page)" }}>
          <SummaryLine label={`Rooms (${totals.totalRooms}) · room-nights`} value={String(totals.roomNights)} muted />
          <SummaryLine label="Room revenue" value={formatRM(totals.roomRevenueSen)} />
          <SummaryLine label="Tourism tax (liability)" value={formatRM(totals.tourismTaxSen)} muted />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}>
            <SummaryLine label="Total billed to guest" value={formatRM(totals.grandTotalSen)} strong />
          </div>
        </div>
      </FormPanel>

      <FormPanel title="Notes" error={error}>
        <textarea
          aria-label="Notes"
          rows={3}
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="rounded-card border p-3"
          style={fieldStyle}
          placeholder="Anything the desk should know — special requests, arrival details."
        />
        <div className="flex gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="btn-primary h-11 rounded-card px-4 font-medium"
            style={{ opacity: pending ? 0.7 : 1 }}
          >
            {pending ? "Saving…" : mode === "new" ? "Create booking" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 rounded-card border px-4"
            style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
          >
            Cancel
          </button>
        </div>
      </FormPanel>
    </div>
  );
}
