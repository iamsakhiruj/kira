"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/card";
import { toSen, fromSen, formatRM } from "@/lib/money";
import {
  PAID_BY,
  reconcile,
  requiresVarianceReason,
  revenueGap,
  otaReceivableSen,
  occupancyRatio,
  adrSen,
  revparSen,
  totalRevenueSen,
} from "@/lib/nightReport";
import { draftKeyFor, switchDraftDate } from "@/lib/draftStorage";
import { submitNightReport } from "./actions";

type Amt = string; // raw user input, parsed to sen with lib/money

// Category is a plain string, not a literal union — the list is DB-editable
// (Phase 2 §2.3, categories collection), fetched server-side and passed in
// as revenueCategoryNames/expenseCategoryNames rather than imported here.
interface RevenueRow {
  id: number;
  category: string;
  amount: Amt;
  note: string;
}
interface ExpenseRow {
  id: number;
  category: string;
  amount: Amt;
  paidTo: string;
  paidBy: (typeof PAID_BY)[number];
  note: string;
  receiptUrl: string;
}
// Platform is a plain id, not a literal union — the list is DB-editable
// (Settings > OTA platforms), fetched server-side and passed in as
// otaPlatforms rather than imported here.
interface OtaBookingRow {
  id: number;
  platformId: string;
  bookingsCount: string; // parsed with parseCount
  roomRevenue: Amt;
  guestPaidPlatform: boolean;
}
interface FormState {
  rooms: {
    available: string;
    sold: string;
    houseUse: string;
    // Walk-in and direct revenue only — the OTA portion is never typed here,
    // it's computed from step 2's booking lines (see `derived.otaRoomRevenueSen`)
    // so reception never has to remember to add it in twice.
    walkInRevenue: Amt;
    reportPhotoUrl: string;
  };
  revenueLines: RevenueRow[];
  otaBookings: OtaBookingRow[];
  collections: {
    cash: Amt;
    card: Amt;
    transfer: Amt;
    ewallet: Amt;
    chargeToAccount: Amt;
    deposits: Amt;
    refunds: Amt;
    receivablesSettled: Amt;
  };
  expenses: ExpenseRow[];
  cash: { openingFloat: Amt; bankedIn: Amt; counted: Amt };
  remarks: string;
  varianceReason: string;
  revenueGapReason: string;
  enteredLateReason: string;
}

interface Defaults {
  roomsAvailable: number | null;
  openingFloatSen: number | null;
}

function initialState(defaults: Defaults): FormState {
  return {
    rooms: {
      available:
        defaults.roomsAvailable != null ? String(defaults.roomsAvailable) : "",
      sold: "",
      houseUse: "",
      walkInRevenue: "",
      reportPhotoUrl: "",
    },
    revenueLines: [],
    otaBookings: [],
    collections: {
      cash: "",
      card: "",
      transfer: "",
      ewallet: "",
      chargeToAccount: "",
      deposits: "",
      refunds: "",
      receivablesSettled: "",
    },
    expenses: [],
    cash: {
      openingFloat:
        defaults.openingFloatSen != null
          ? fromSen(defaults.openingFloatSen)
          : "",
      bankedIn: "",
      counted: "",
    },
    remarks: "",
    varianceReason: "",
    revenueGapReason: "",
    enteredLateReason: "",
  };
}

/** Parse an amount field to sen. Empty is 0; unparseable is null. */
function parseAmt(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    return toSen(s);
  } catch {
    return null;
  }
}
/** True if the field is unparseable OR a valid-but-negative amount — every
 * amount on this form must be zero or more, so both count as "fix this". */
function amtInvalid(s: string): boolean {
  const v = parseAmt(s);
  return v === null || v < 0;
}
function sen(s: string): number {
  const v = parseAmt(s);
  return v === null ? 0 : v;
}
function parseCount(s: string): number {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
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
      className="money h-11 w-full rounded border px-3"
      style={{
        ...fieldStyle,
        borderColor: invalid ? "var(--warn)" : "var(--border-strong)",
      }}
    />
  );
}

function IntInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      placeholder="0"
      className="money h-11 w-full rounded border px-3"
      style={fieldStyle}
    />
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
      {children}
    </h2>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/** Highest row id already in use in a loaded draft, so newly added rows
 * never reuse an id from a different date's draft — `nextId` is a ref that
 * persists across date switches, but a freshly *mounted* component always
 * restarts it at 1, which could otherwise collide with ids already present
 * in whatever draft gets loaded (on mount, or on switching to a date with
 * its own existing draft). */
function maxRowId(state: FormState): number {
  const ids = [...state.revenueLines, ...state.otaBookings, ...state.expenses].map(
    (r) => r.id,
  );
  return ids.length ? Math.max(...ids) : 0;
}

// --- Step scaffolding --------------------------------------------------
// Five steps, each meant to fit one screen without scrolling. Freely
// navigable — no step is locked behind completing an earlier one — so
// reception can fill them out of order at 1am and Submit (in the rail)
// jumps straight to whichever step actually has a problem.

const STEPS = [
  { n: 1, label: "Rooms" },
  { n: 2, label: "OTA" },
  { n: 3, label: "Money in" },
  { n: 4, label: "Money out" },
  { n: 5, label: "Cash count" },
] as const;

function ProgressBar({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {STEPS.map((s) => {
        const active = s.n === current;
        return (
          <button
            key={s.n}
            type="button"
            onClick={() => onSelect(s.n)}
            className="flex flex-1 flex-col items-center gap-1 rounded-card py-2"
            style={{ background: active ? "var(--brand-tint)" : "transparent" }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 28,
                height: 28,
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                background: active ? "var(--brand)" : "var(--surface)",
                color: active ? "var(--on-brand)" : "var(--text-muted)",
                border: active ? "none" : "1px solid var(--border-strong)",
              }}
            >
              {s.n}
            </span>
            <span
              className="hidden sm:block"
              style={{
                fontSize: "var(--text-caption)",
                color: active ? "var(--brand)" : "var(--text-muted)",
                fontWeight: active ? 600 : undefined,
              }}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StepNav({
  step,
  onBack,
  onNext,
  onSubmit,
  pending,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const isLast = step === 5;
  return (
    <div className="flex gap-3 pt-2">
      {step > 1 ? (
        <button
          type="button"
          onClick={onBack}
          className="h-11 flex-1 rounded-card border"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
        >
          Back
        </button>
      ) : null}
      {isLast ? (
        <button
          type="button"
          disabled={pending}
          onClick={onSubmit}
          className="h-11 flex-1 rounded-card font-medium"
          style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Submitting…" : "Submit night report"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="h-11 flex-1 rounded-card font-medium"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
        >
          Continue
        </button>
      )}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="money">{value}</span>
    </div>
  );
}

/** Always visible: sticky on the right on desktop, a compact card above the
 * step on mobile (see the layout grid in the main render). Flat, no
 * animation — reception density, not the owner/manager card system. */
function SummaryRail({
  soldCount,
  availableCount,
  revenueSen,
  collectedSen,
  otaOwedSen,
  gapSen,
  gapReasonRequired,
  varianceSen,
  varianceReasonRequired,
  showVarianceProminent,
  showSubmit,
  onSubmit,
  pending,
  error,
}: {
  soldCount: number;
  availableCount: number;
  revenueSen: number;
  collectedSen: number;
  otaOwedSen: number;
  gapSen: number;
  gapReasonRequired: boolean;
  varianceSen: number;
  varianceReasonRequired: boolean;
  showVarianceProminent: boolean;
  showSubmit: boolean;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
}) {
  const varianceColor = varianceReasonRequired ? "var(--warn)" : "var(--text)";
  return (
    <Card flat className="flex flex-col gap-3 p-4" style={{ fontSize: "var(--text-label)" }}>
      <SummaryLine label="Rooms sold" value={`${soldCount}/${availableCount}`} />
      <SummaryLine label="Revenue" value={`RM ${fromSen(revenueSen)}`} />
      <SummaryLine label="Collected" value={`RM ${fromSen(collectedSen)}`} />
      <SummaryLine label="Owed by OTAs" value={`RM ${fromSen(otaOwedSen)}`} />
      <div
        className="flex items-center justify-between"
        style={gapReasonRequired ? { color: "var(--warn)" } : { color: "var(--text-muted)" }}
      >
        <span>Revenue gap{gapReasonRequired ? " — out of tolerance" : ""}</span>
        <span className="money" style={{ fontWeight: 600 }}>
          {gapSen > 0 ? "+" : ""}
          {formatRM(gapSen)}
        </span>
      </div>
      {showVarianceProminent ? (
        <div
          className="flex flex-col gap-1 rounded-card px-2 py-2"
          style={{ background: varianceReasonRequired ? "var(--warn-bg)" : "var(--page)" }}
        >
          <span style={{ fontWeight: 600, color: varianceColor }}>
            Variance{varianceReasonRequired ? " — out of tolerance" : ""}
          </span>
          <span
            className="money"
            style={{ fontSize: "var(--text-hero-money)", fontWeight: 600, color: varianceColor }}
          >
            {varianceSen > 0 ? "+" : ""}
            {formatRM(varianceSen)}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--text-faint)" }}>Variance</span>
          <span style={{ color: "var(--text-faint)", fontSize: "var(--text-caption)" }}>
            Shown after cash count
          </span>
        </div>
      )}
      {error ? (
        <p role="alert" style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>
          {error}
        </p>
      ) : null}
      {showSubmit ? (
        <button
          type="button"
          disabled={pending}
          onClick={onSubmit}
          className="btn-primary h-11 rounded-card font-medium"
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Submitting…" : "Submit night report"}
        </button>
      ) : null}
    </Card>
  );
}

const DEFAULT_COLLECTION_FIELDS = [
  ["cash", "Cash"],
  ["transfer", "DuitNow / transfer / QR"],
] as const;

// Not named in the progressive-disclosure spec alongside card/e-wallet/
// deposits/refunds/receivables-settled — folded in here anyway since it's
// a receivable, not an every-night field, so it belongs with "the rest."
const HIDDEN_COLLECTION_FIELDS = [
  ["card", "Card terminal"],
  ["ewallet", "E-wallet"],
  ["chargeToAccount", "Charge to account (receivable)"],
  ["deposits", "Deposits received"],
  ["refunds", "Refunds paid out"],
  ["receivablesSettled", "Receivables settled today"],
] as const;

export default function NightReportForm({
  date: initialDate,
  currentDate,
  minDate,
  maxDate,
  defaults,
  varianceThresholdSen,
  revenueGapThresholdSen,
  expenseCeilingSen,
  revenueCategoryNames,
  expenseCategoryNames,
  otaPlatforms,
  existingDates,
}: {
  date: string;
  currentDate: string;
  minDate: string | undefined;
  maxDate: string;
  defaults: Defaults;
  varianceThresholdSen: number;
  revenueGapThresholdSen: number;
  expenseCeilingSen: number;
  revenueCategoryNames: string[];
  expenseCategoryNames: string[];
  otaPlatforms: { id: string; name: string; guestPaysPlatform: boolean }[];
  /** Dates that already have a report — picking one shows a notice instead of
   * a blank form that would fail the unique index on submit. */
  existingDates: string[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [state, setState] = useState<FormState>(() => initialState(defaults));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [moneyInExpanded, setMoneyInExpanded] = useState(false);
  const loaded = useRef(false);
  const nextId = useRef(1);

  // Load any locally saved draft for the initial date, once, on mount
  // (client only — localStorage doesn't exist during SSR, which is why this
  // has to be an effect rather than a lazy useState initializer). Date
  // changes after mount are handled explicitly by handleDateChange below,
  // not by re-running this effect — it must only ever see the date this
  // component was first opened with.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKeyFor(initialDate));
      if (raw) {
        const loadedState = JSON.parse(raw) as FormState;
        setState(loadedState);
        nextId.current = maxRowId(loadedState) + 1;
      }
    } catch {
      // ignore a corrupt draft
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  // Autosave so a dropped connection at 1am doesn't lose the entry. Runs on
  // every state change regardless of which step is showing — "drafts save
  // per step as they type" is this same whole-state autosave, not a new
  // per-step mechanism.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(draftKeyFor(date), JSON.stringify(state));
    } catch {
      // storage full / unavailable — nothing we can do, keep going
    }
  }, [state, date]);

  // Switching dates must never lose the entry for the date being left — see
  // lib/draftStorage.ts. Saves the outgoing date's state under its own key
  // first, then loads (or blanks) the incoming date, warning first if the
  // outgoing entry has anything in it.
  function handleDateChange(newDate: string) {
    if (newDate === date) return;
    const blank = initialState(defaults);
    const dirty = JSON.stringify(state) !== JSON.stringify(blank);
    if (dirty) {
      const proceed = window.confirm(
        `You have an entry in progress for ${date}. It's saved and won't be lost — switching dates shows that date's own entry instead. Continue?`,
      );
      if (!proceed) return;
    }
    const nextState = switchDraftDate(localStorage, date, state, newDate, blank);
    nextId.current = maxRowId(nextState) + 1;
    setError(null);
    setCurrentStep(1);
    setDate(newDate);
    setState(nextState);
  }

  const derived = useMemo(() => {
    const available = parseCount(state.rooms.available);
    const sold = parseCount(state.rooms.sold);
    const walkInRevenueSen = sen(state.rooms.walkInRevenue);
    // Every OTA booking line's room revenue counts toward total room revenue
    // regardless of who paid (guest-paid-us or guest-paid-platform) — rooms
    // sold is one count no matter the channel. This is the figure that used
    // to be reception's job to fold into the room-revenue field by hand.
    const otaRoomRevenueSen = state.otaBookings.reduce(
      (sum, l) => sum + sen(l.roomRevenue),
      0,
    );
    const roomRevenueSen = walkInRevenueSen + otaRoomRevenueSen;
    const revenueLinesSen = state.revenueLines.map((l) => ({
      amountSen: sen(l.amount),
    }));
    const recon = reconcile({
      collections: {
        cashSen: sen(state.collections.cash),
        refundsSen: sen(state.collections.refunds),
      },
      expenses: state.expenses.map((e) => ({
        amountSen: sen(e.amount),
        paidBy: e.paidBy,
      })),
      cash: {
        openingFloatSen: sen(state.cash.openingFloat),
        bankedInSen: sen(state.cash.bankedIn),
        countedSen: sen(state.cash.counted),
      },
    });
    const totalRevSen = totalRevenueSen(roomRevenueSen, revenueLinesSen);
    const otaBookingsSen = state.otaBookings.map((l) => ({
      roomRevenueSen: sen(l.roomRevenue),
      guestPaidPlatform: l.guestPaidPlatform,
    }));
    const otaOwedSen = otaReceivableSen(otaBookingsSen);
    const gap = revenueGap({
      totalRevenueSen: totalRevSen,
      otaReceivableSen: otaOwedSen,
      collections: {
        cashSen: sen(state.collections.cash),
        cardSen: sen(state.collections.card),
        transferSen: sen(state.collections.transfer),
        ewalletSen: sen(state.collections.ewallet),
        chargeToAccountSen: sen(state.collections.chargeToAccount),
        refundsSen: sen(state.collections.refunds),
        receivablesSettledSen: sen(state.collections.receivablesSettled),
      },
    });
    return {
      available,
      sold,
      occupancy: occupancyRatio(sold, available),
      adr: adrSen(roomRevenueSen, sold),
      revpar: revparSen(roomRevenueSen, available),
      roomRevenueSen,
      otaRoomRevenueSen,
      totalRevenueSen: totalRevSen,
      otaOwedSen,
      recon,
      reasonRequired: requiresVarianceReason(
        recon.varianceSen,
        varianceThresholdSen,
      ),
      gap,
      gapReasonRequired: requiresVarianceReason(
        gap.gapSen,
        revenueGapThresholdSen,
      ),
    };
  }, [state, varianceThresholdSen, revenueGapThresholdSen]);

  const set = (updater: (s: FormState) => FormState) =>
    setState((s) => updater(structuredClone(s)));

  function addRevenueLine() {
    set((s) => {
      s.revenueLines.push({
        id: nextId.current++,
        category: revenueCategoryNames[0] ?? "",
        amount: "",
        note: "",
      });
      return s;
    });
  }
  function addOtaBooking() {
    set((s) => {
      const platform = otaPlatforms[0];
      s.otaBookings.push({
        id: nextId.current++,
        platformId: platform?.id ?? "",
        bookingsCount: "1",
        roomRevenue: "",
        guestPaidPlatform: platform?.guestPaysPlatform ?? false,
      });
      return s;
    });
  }
  function addExpense() {
    set((s) => {
      s.expenses.push({
        id: nextId.current++,
        category: expenseCategoryNames[0] ?? "",
        amount: "",
        paidTo: "",
        paidBy: "cash",
        note: "",
        receiptUrl: "",
      });
      return s;
    });
  }

  /**
   * The same checks handleSubmit has always run, now each tagged with the
   * step it belongs to. Called both to render the rail's Submit shortcut
   * (canSubmitNow, below) and from handleSubmit itself — so clicking
   * Submit from any step (or the rail) jumps straight to whichever step
   * actually needs fixing, which matters once steps are freely navigable
   * and Submit is reachable from more than one place.
   */
  function firstValidationError(): { message: string; step?: number } | null {
    if (date !== currentDate && !state.enteredLateReason.trim()) {
      return {
        message: `This report is for ${date}, not today — enter a short reason it's being entered late.`,
      };
    }

    // Step 1 — Rooms + other revenue
    if (
      amtInvalid(state.rooms.walkInRevenue) ||
      state.revenueLines.some((l) => amtInvalid(l.amount))
    ) {
      return {
        message: "Some amounts aren't valid — an amount can't be negative. Check the fields outlined in amber.",
        step: 1,
      };
    }
    const available = parseCount(state.rooms.available);
    const sold = parseCount(state.rooms.sold);
    const houseUse = parseCount(state.rooms.houseUse);
    if ([available, sold, houseUse].some((n) => Number.isNaN(n))) {
      return { message: "Room counts must be whole numbers.", step: 1 };
    }
    if (sold + houseUse > available) {
      return {
        message: "Rooms sold plus house use cannot exceed rooms available.",
        step: 1,
      };
    }

    // Step 2 — OTA bookings
    if (state.otaBookings.some((l) => amtInvalid(l.roomRevenue))) {
      return {
        message: "Some amounts aren't valid — an amount can't be negative. Check the fields outlined in amber.",
        step: 2,
      };
    }
    const badOtaBooking = state.otaBookings.some((l) => {
      const count = parseCount(l.bookingsCount);
      return !l.platformId || Number.isNaN(count) || count < 1;
    });
    if (badOtaBooking) {
      return {
        message: "Each OTA booking line needs a platform and at least 1 booking — remove a line instead of leaving it blank.",
        step: 2,
      };
    }

    // Step 3 — Money in
    if (Object.values(state.collections).some((v) => amtInvalid(v))) {
      return {
        message: "Some amounts aren't valid — an amount can't be negative. Check the fields outlined in amber.",
        step: 3,
      };
    }
    if (derived.gapReasonRequired && !state.revenueGapReason.trim()) {
      return {
        message: `Revenue is ${formatRM(Math.abs(derived.gap.gapSen))} ${
          derived.gap.gapSen < 0 ? "under" : "over"
        } what collections and receivables account for. Enter a reason before submitting.`,
        step: 3,
      };
    }

    // Step 4 — Money out
    if (state.expenses.some((e) => amtInvalid(e.amount))) {
      return {
        message: "Some amounts aren't valid — an amount can't be negative. Check the fields outlined in amber.",
        step: 4,
      };
    }
    const overCeiling = state.expenses.find(
      (e) => sen(e.amount) > expenseCeilingSen && !e.note.trim(),
    );
    if (overCeiling) {
      return {
        message: `The ${formatRM(sen(overCeiling.amount))} "${overCeiling.category}" expense is over the ${formatRM(expenseCeilingSen)} ceiling — add a note for the owner before submitting.`,
        step: 4,
      };
    }

    // Step 5 — Cash count
    if (Object.values(state.cash).some((v) => amtInvalid(v))) {
      return {
        message: "Some amounts aren't valid — an amount can't be negative. Check the fields outlined in amber.",
        step: 5,
      };
    }
    if (derived.reasonRequired && !state.varianceReason.trim()) {
      return {
        message: `The drawer is ${formatRM(Math.abs(derived.recon.varianceSen))} ${
          derived.recon.varianceSen < 0 ? "short" : "over"
        }. Enter a reason before submitting.`,
        step: 5,
      };
    }

    return null;
  }

  async function handleSubmit() {
    setError(null);

    const problem = firstValidationError();
    if (problem) {
      setError(problem.message);
      if (problem.step) setCurrentStep(problem.step);
      return;
    }

    const available = parseCount(state.rooms.available);
    const sold = parseCount(state.rooms.sold);
    const houseUse = parseCount(state.rooms.houseUse);

    const report = {
      rooms: {
        available,
        sold,
        houseUse,
        // Walk-in typed by reception + the OTA portion computed from step 2 —
        // see derived.roomRevenueSen. Never re-read state.rooms directly here,
        // or the two figures could drift apart from what the rail showed.
        revenueSen: derived.roomRevenueSen,
        reportPhotoUrl: state.rooms.reportPhotoUrl.trim() || undefined,
      },
      revenueLines: state.revenueLines.map((l) => ({
        category: l.category,
        amountSen: sen(l.amount),
        note: l.note,
      })),
      otaBookings: state.otaBookings.map((l) => ({
        platformId: l.platformId,
        bookingsCount: parseCount(l.bookingsCount),
        roomRevenueSen: sen(l.roomRevenue),
        guestPaidPlatform: l.guestPaidPlatform,
      })),
      collections: {
        cashSen: sen(state.collections.cash),
        cardSen: sen(state.collections.card),
        transferSen: sen(state.collections.transfer),
        ewalletSen: sen(state.collections.ewallet),
        chargeToAccountSen: sen(state.collections.chargeToAccount),
        depositsSen: sen(state.collections.deposits),
        refundsSen: sen(state.collections.refunds),
        receivablesSettledSen: sen(state.collections.receivablesSettled),
      },
      expenses: state.expenses.map((e) => ({
        category: e.category,
        amountSen: sen(e.amount),
        paidTo: e.paidTo,
        paidBy: e.paidBy,
        note: e.note,
        receiptUrl: e.receiptUrl.trim() || undefined,
      })),
      cash: {
        openingFloatSen: sen(state.cash.openingFloat),
        bankedInSen: sen(state.cash.bankedIn),
        countedSen: sen(state.cash.counted),
      },
      remarks: state.remarks,
      varianceReason: state.varianceReason,
      revenueGapReason: state.revenueGapReason,
      enteredLateReason: state.enteredLateReason,
    };

    setPending(true);
    try {
      const res = await submitNightReport({ date, report });
      if (res.ok) {
        try {
          localStorage.removeItem(draftKeyFor(date));
        } catch {
          /* ignore */
        }
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't submit — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  // A report already exists for this date — don't offer a blank form that would
  // only fail the unique index on submit. Keep the date picker so they can move
  // to a date that needs one. (All hooks above have already run, so this early
  // return is safe.)
  if (existingDates.includes(date)) {
    return (
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-3">
          <Row label="Report date">
            <input
              aria-label="Report date"
              type="date"
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-11 rounded border px-3"
              style={fieldStyle}
            />
          </Row>
        </section>
        <p
          className="rounded-card border p-4"
          style={{ background: "var(--warn-bg)", borderColor: "var(--warn)", color: "var(--text)" }}
        >
          A report for <strong>{date}</strong> already exists. Pick a different date to
          add a missing report — an existing one is edited from the approval queue
          (owner/manager) or corrected by request.
        </p>
      </div>
    );
  }

  const isBackdated = date !== currentDate;
  const validation = firstValidationError();
  const canSubmitNow = validation === null;
  const hasHiddenCollectionValues = HIDDEN_COLLECTION_FIELDS.some(
    ([key]) => state.collections[key].trim() !== "",
  );
  const showAllCollections = moneyInExpanded || hasHiddenCollectionValues;

  return (
    <div className="flex flex-col gap-4">
      {/* Date — always visible, not step-scoped: the date this report is
          for is a page-level concern, not one of the five steps. */}
      <section className="flex flex-col gap-3">
        <Row label="Report date">
          <input
            aria-label="Report date"
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-11 rounded border px-3"
            style={fieldStyle}
          />
        </Row>
        {isBackdated ? (
          <Row label="Why is this being entered late? (required)">
            <input
              aria-label="Reason entered late"
              placeholder="e.g. power cut, sick shift, forgotten"
              className="h-11 rounded border px-3"
              style={{
                ...fieldStyle,
                borderColor: state.enteredLateReason.trim()
                  ? "var(--border-strong)"
                  : "var(--warn)",
              }}
              value={state.enteredLateReason}
              onChange={(e) =>
                set((s) => ((s.enteredLateReason = e.target.value), s))
              }
            />
          </Row>
        ) : null}
      </section>

      <ProgressBar current={currentStep} onSelect={setCurrentStep} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px] md:items-start">
        {/* Step content */}
        <div className="order-2 flex flex-col gap-6 md:order-1">
          {currentStep === 1 ? (
            <>
              <section className="flex flex-col gap-3">
                <SectionHeading>Rooms</SectionHeading>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Rooms available">
                    <IntInput
                      ariaLabel="Rooms available"
                      value={state.rooms.available}
                      onChange={(x) => set((s) => ((s.rooms.available = x), s))}
                    />
                  </Row>
                  <Row label="Rooms sold">
                    <IntInput
                      ariaLabel="Rooms sold"
                      value={state.rooms.sold}
                      onChange={(x) => set((s) => ((s.rooms.sold = x), s))}
                    />
                  </Row>
                  <Row label="House use / comp">
                    <IntInput
                      ariaLabel="House use"
                      value={state.rooms.houseUse}
                      onChange={(x) => set((s) => ((s.rooms.houseUse = x), s))}
                    />
                  </Row>
                </div>
                <Card flat className="flex flex-col gap-2 p-3">
                  <Row label="Walk-in and direct room revenue (RM)">
                    <MoneyInput
                      ariaLabel="Walk-in and direct room revenue"
                      value={state.rooms.walkInRevenue}
                      onChange={(x) => set((s) => ((s.rooms.walkInRevenue = x), s))}
                    />
                  </Row>
                  <div className="flex items-center justify-between" style={{ fontSize: "var(--text-label)" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      From OTA bookings (step 2)
                    </span>
                    <span className="money" style={{ color: "var(--text-muted)" }}>
                      {formatRM(derived.otaRoomRevenueSen)}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between"
                    style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}
                  >
                    <span style={{ fontWeight: 600 }}>Total room revenue</span>
                    <span className="money" style={{ fontWeight: 600 }}>
                      {formatRM(derived.roomRevenueSen)}
                    </span>
                  </div>
                </Card>
                <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
                  Occupancy {(derived.occupancy * 100).toFixed(0)}% · ADR{" "}
                  {formatRM(derived.adr)} · RevPAR {formatRM(derived.revpar)}
                </p>
                <Row label="iHotel report photo link (optional)">
                  <input
                    aria-label="iHotel report photo link"
                    placeholder="Paste a link — WhatsApp, Google Photos, etc."
                    className="h-11 rounded border px-3"
                    style={fieldStyle}
                    value={state.rooms.reportPhotoUrl}
                    onChange={(e) =>
                      set((s) => ((s.rooms.reportPhotoUrl = e.target.value), s))
                    }
                  />
                </Row>
              </section>

              <section className="flex flex-col gap-3">
                <SectionHeading>Other revenue</SectionHeading>
                {state.revenueLines.map((line, i) => (
                  <Card key={line.id} flat className="flex flex-col gap-2 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Revenue category"
                        className="h-11 rounded border px-2"
                        style={fieldStyle}
                        value={line.category}
                        onChange={(e) =>
                          set((s) => ((s.revenueLines[i].category = e.target.value), s))
                        }
                      >
                        {revenueCategoryNames.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <MoneyInput
                        ariaLabel="Revenue amount"
                        value={line.amount}
                        onChange={(x) => set((s) => ((s.revenueLines[i].amount = x), s))}
                      />
                    </div>
                    <input
                      aria-label="Revenue note"
                      placeholder="Note (optional)"
                      className="h-11 rounded border px-3"
                      style={fieldStyle}
                      value={line.note}
                      onChange={(e) => set((s) => ((s.revenueLines[i].note = e.target.value), s))}
                    />
                    <button
                      type="button"
                      onClick={() => set((s) => ((s.revenueLines.splice(i, 1)), s))}
                      style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}
                    >
                      Remove
                    </button>
                  </Card>
                ))}
                <button
                  type="button"
                  onClick={addRevenueLine}
                  className="h-11 rounded-card border"
                  style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
                >
                  + Add revenue line
                </button>
              </section>
            </>
          ) : null}

          {currentStep === 2 ? (
            <section className="flex flex-col gap-3">
              <SectionHeading>OTA bookings</SectionHeading>
              <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
                Add a line only for platforms with bookings tonight. Record the
                full room rate, never the expected payout — commission is worked
                out later, when the remittance arrives.
              </p>
              {state.otaBookings.map((line, i) => (
                <Card key={line.id} flat className="flex flex-col gap-2 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="OTA platform"
                      className="h-11 rounded border px-2"
                      style={fieldStyle}
                      value={line.platformId}
                      onChange={(e) => {
                        const platformId = e.target.value;
                        const platform = otaPlatforms.find((p) => p.id === platformId);
                        set((s) => {
                          s.otaBookings[i].platformId = platformId;
                          s.otaBookings[i].guestPaidPlatform =
                            platform?.guestPaysPlatform ?? s.otaBookings[i].guestPaidPlatform;
                          return s;
                        });
                      }}
                    >
                      {otaPlatforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <IntInput
                      ariaLabel="Number of bookings"
                      value={line.bookingsCount}
                      onChange={(x) => set((s) => ((s.otaBookings[i].bookingsCount = x), s))}
                    />
                  </div>
                  <MoneyInput
                    ariaLabel="OTA room revenue"
                    value={line.roomRevenue}
                    onChange={(x) => set((s) => ((s.otaBookings[i].roomRevenue = x), s))}
                  />
                  <div className="flex gap-2" role="group" aria-label="Guest paid">
                    {(
                      [
                        [false, "Guest paid us"],
                        [true, "Guest paid platform"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => set((s) => ((s.otaBookings[i].guestPaidPlatform = value), s))}
                        className="h-11 flex-1 rounded-card border"
                        style={{
                          borderColor:
                            line.guestPaidPlatform === value ? "var(--brand)" : "var(--border-strong)",
                          background: line.guestPaidPlatform === value ? "var(--brand-tint)" : "var(--surface)",
                          color: line.guestPaidPlatform === value ? "var(--brand)" : "var(--text-muted)",
                          fontWeight: line.guestPaidPlatform === value ? 600 : undefined,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => set((s) => ((s.otaBookings.splice(i, 1)), s))}
                    style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}
                  >
                    Remove
                  </button>
                </Card>
              ))}
              <button
                type="button"
                onClick={addOtaBooking}
                disabled={otaPlatforms.length === 0}
                className="h-11 rounded-card border"
                style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
              >
                + Add OTA booking
              </button>
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section className="flex flex-col gap-3">
              <SectionHeading>Money in</SectionHeading>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DEFAULT_COLLECTION_FIELDS.map(([key, label]) => (
                  <Row key={key} label={label}>
                    <MoneyInput
                      ariaLabel={label}
                      value={state.collections[key]}
                      onChange={(x) => set((s) => ((s.collections[key] = x), s))}
                    />
                  </Row>
                ))}
                {showAllCollections
                  ? HIDDEN_COLLECTION_FIELDS.map(([key, label]) => (
                      <Row key={key} label={label}>
                        <MoneyInput
                          ariaLabel={label}
                          value={state.collections[key]}
                          onChange={(x) => set((s) => ((s.collections[key] = x), s))}
                        />
                      </Row>
                    ))
                  : null}
              </div>
              {!showAllCollections ? (
                <button
                  type="button"
                  onClick={() => setMoneyInExpanded(true)}
                  className="h-11 self-start rounded-card border px-4"
                  style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
                >
                  Show more (card, e-wallet, deposits, refunds, receivables settled)
                </button>
              ) : !hasHiddenCollectionValues ? (
                <button
                  type="button"
                  onClick={() => setMoneyInExpanded(false)}
                  style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}
                >
                  Show fewer fields
                </button>
              ) : null}
              <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
                &ldquo;Receivables settled today&rdquo; is money above that pays off an old
                bill — e.g. a monthly guest clearing last month&apos;s account — not new
                revenue. Leave at 0 on an ordinary night.
              </p>
            </section>
          ) : null}

          {currentStep === 4 ? (
            <section className="flex flex-col gap-3">
              <SectionHeading>Money out</SectionHeading>
              {state.expenses.map((e, i) => (
                <Card key={e.id} flat className="flex flex-col gap-2 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Expense category"
                      className="h-11 rounded border px-2"
                      style={fieldStyle}
                      value={e.category}
                      onChange={(ev) =>
                        set((s) => ((s.expenses[i].category = ev.target.value), s))
                      }
                    >
                      {expenseCategoryNames.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <MoneyInput
                      ariaLabel="Expense amount"
                      value={e.amount}
                      onChange={(x) => set((s) => ((s.expenses[i].amount = x), s))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      aria-label="Paid to"
                      placeholder="Paid to"
                      className="h-11 rounded border px-3"
                      style={fieldStyle}
                      value={e.paidTo}
                      onChange={(ev) => set((s) => ((s.expenses[i].paidTo = ev.target.value), s))}
                    />
                    <select
                      aria-label="Paid by"
                      className="h-11 rounded border px-2"
                      style={fieldStyle}
                      value={e.paidBy}
                      onChange={(ev) => set((s) => ((s.expenses[i].paidBy = ev.target.value as ExpenseRow["paidBy"]), s))}
                    >
                      {PAID_BY.map((p) => (
                        <option key={p} value={p}>
                          {p === "cash" ? "Paid in cash" : "Paid by card"}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const overCeiling =
                      sen(e.amount) > expenseCeilingSen && !e.note.trim();
                    return (
                      <>
                        <input
                          aria-label="Expense note"
                          placeholder={
                            sen(e.amount) > expenseCeilingSen
                              ? `Over ${formatRM(expenseCeilingSen)} — note for the owner (required)`
                              : "Note (optional)"
                          }
                          className="h-11 rounded border px-3"
                          style={{
                            ...fieldStyle,
                            borderColor: overCeiling ? "var(--warn)" : "var(--border-strong)",
                          }}
                          value={e.note}
                          onChange={(ev) => set((s) => ((s.expenses[i].note = ev.target.value), s))}
                        />
                        {overCeiling ? (
                          <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>
                            This is over the {formatRM(expenseCeilingSen)} per-item ceiling —
                            add a note explaining it for the owner.
                          </p>
                        ) : null}
                      </>
                    );
                  })()}
                  <input
                    aria-label="Receipt photo link"
                    placeholder="Receipt photo link (optional)"
                    className="h-11 rounded border px-3"
                    style={fieldStyle}
                    value={e.receiptUrl}
                    onChange={(ev) => set((s) => ((s.expenses[i].receiptUrl = ev.target.value), s))}
                  />
                  <button
                    type="button"
                    onClick={() => set((s) => ((s.expenses.splice(i, 1)), s))}
                    style={{ fontSize: "var(--text-label)", color: "var(--text-muted)", alignSelf: "flex-start" }}
                  >
                    Remove
                  </button>
                </Card>
              ))}
              <button
                type="button"
                onClick={addExpense}
                className="h-11 rounded-card border"
                style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
              >
                + Add expense
              </button>
              <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
                Only cash expenses affect the drawer. Card ones don&apos;t.
              </p>
            </section>
          ) : null}

          {currentStep === 5 ? (
            <>
              <section className="flex flex-col gap-3">
                <SectionHeading>Cash count</SectionHeading>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Row label="Opening float (RM)">
                    <MoneyInput
                      ariaLabel="Opening float"
                      value={state.cash.openingFloat}
                      onChange={(x) => set((s) => ((s.cash.openingFloat = x), s))}
                    />
                  </Row>
                  <Row label="Banked in (RM)">
                    <MoneyInput
                      ariaLabel="Banked in"
                      value={state.cash.bankedIn}
                      onChange={(x) => set((s) => ((s.cash.bankedIn = x), s))}
                    />
                  </Row>
                  <Row label="Cash counted (RM)">
                    <MoneyInput
                      ariaLabel="Cash counted"
                      value={state.cash.counted}
                      onChange={(x) => set((s) => ((s.cash.counted = x), s))}
                    />
                  </Row>
                </div>
                {derived.reasonRequired ? (
                  <Row label="Reason for the variance (required)">
                    <input
                      aria-label="Variance reason"
                      className="h-11 rounded border px-3"
                      style={fieldStyle}
                      value={state.varianceReason}
                      onChange={(e) => set((s) => ((s.varianceReason = e.target.value), s))}
                    />
                  </Row>
                ) : null}
                {derived.gapReasonRequired ? (
                  <Row label="Reason for the revenue gap (required)">
                    <input
                      aria-label="Revenue gap reason"
                      className="h-11 rounded border px-3"
                      style={fieldStyle}
                      value={state.revenueGapReason}
                      onChange={(e) => set((s) => ((s.revenueGapReason = e.target.value), s))}
                    />
                  </Row>
                ) : null}
              </section>

              <section className="flex flex-col gap-3">
                <SectionHeading>Remarks</SectionHeading>
                <textarea
                  aria-label="Remarks"
                  rows={3}
                  placeholder="Complaints, walk-ins turned away, maintenance — anything unusual."
                  className="rounded-card border p-3"
                  style={fieldStyle}
                  value={state.remarks}
                  onChange={(e) => set((s) => ((s.remarks = e.target.value), s))}
                />
              </section>
            </>
          ) : null}

          <StepNav
            step={currentStep}
            onBack={() => setCurrentStep((s) => Math.max(1, s - 1))}
            onNext={() => setCurrentStep((s) => Math.min(5, s + 1))}
            onSubmit={handleSubmit}
            pending={pending}
          />
        </div>

        {/* Summary rail — compact card above the step on mobile (order-1,
            not sticky, scrolls with the page — speed over polish); sticky
            on the right on desktop. */}
        <div className="order-1 md:order-2 md:sticky md:top-4">
          <SummaryRail
            soldCount={derived.sold}
            availableCount={derived.available}
            revenueSen={derived.totalRevenueSen}
            collectedSen={derived.gap.actualCollectionsSen}
            otaOwedSen={derived.otaOwedSen}
            gapSen={derived.gap.gapSen}
            gapReasonRequired={derived.gapReasonRequired}
            varianceSen={derived.recon.varianceSen}
            varianceReasonRequired={derived.reasonRequired}
            showVarianceProminent={currentStep === 5}
            showSubmit={currentStep === 5 || canSubmitNow}
            onSubmit={handleSubmit}
            pending={pending}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
