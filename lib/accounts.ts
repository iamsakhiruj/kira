/**
 * `accounts` schema and pure balance calculation — one balance per place
 * money is held (cash drawer / bank / e-wallet). Pure, no database import
 * (see `lib/paymentMethods.ts` for the pattern) — DB access lives in
 * `lib/accountsStore.ts`.
 *
 * The balance is never stored as a running total — it's computed on demand
 * as opening balance + everything that moved in or out, across all six
 * money sources (night reports, standalone revenue/expenses, salary
 * payments, partner transactions, OTA remittances). No historical data is
 * migrated or mutated; this queries what already exists.
 */

import { z } from "zod";
import { businessDateMinusDays } from "./businessDate";
import type { PAID_BY } from "./nightReport";

export const ACCOUNT_TYPES = ["cash", "bank", "ewallet"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

export const AccountSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(ACCOUNT_TYPES),
  // Signed, not clamped to >=0 — unlike a physical float, a bank account can
  // legitimately open overdrawn. The owner types this once; it isn't derived.
  openingBalanceSen: z.number().int("Amounts are stored as whole sen."),
  openingDate: dateStr,
  active: z.boolean(),
  displayOrder: z.number().int(),
});

export type Account = z.infer<typeof AccountSchema>;

/** What the client sends to create or edit one. */
export const AccountInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(ACCOUNT_TYPES),
  openingBalanceSen: z.number().int("Amounts are stored as whole sen."),
  openingDate: dateStr,
  displayOrder: z.number().int(),
});

/** Seeded once, if the collection is empty — opening balance/date default to
 * 0 / today; the owner edits each to the real figures afterward. */
export const DEFAULT_ACCOUNTS: { name: string; type: AccountType; displayOrder: number }[] = [
  { name: "Cash drawer", type: "cash", displayOrder: 0 },
  { name: "Bank", type: "bank", displayOrder: 1 },
  { name: "E-wallet", type: "ewallet", displayOrder: 2 },
];

// --- Balance calculation ---------------------------------------------------

export interface AccountMovement {
  accountId: string;
  amountSen: number; // signed: positive = in, negative = out
  date: string; // YYYY-MM-DD
  source: string; // display label for the drill-down
}

export interface AccountPeriodSummary {
  accountId: string;
  openingSen: number; // balance at the instant before `from`
  moneyInSen: number;
  moneyOutSen: number;
  closingSen: number;
}

/**
 * Opening/in/out/closing for one account over `[from, to]`, from its full
 * movement history (any date, not pre-filtered to the period). A period
 * that starts before the account's own `openingDate` just carries the
 * opening balance forward — nothing "happened" before the account existed.
 */
export function summarizeAccountPeriod(
  account: { id: string; openingBalanceSen: number; openingDate: string },
  movements: AccountMovement[],
  from: string,
  to: string,
): AccountPeriodSummary {
  const mine = movements.filter((m) => m.accountId === account.id);
  const dayBeforeFrom = businessDateMinusDays(from, 1);

  const openingSen =
    account.openingDate > dayBeforeFrom
      ? account.openingBalanceSen
      : account.openingBalanceSen + sumBetween(mine, account.openingDate, dayBeforeFrom);

  const periodFrom = account.openingDate > from ? account.openingDate : from;
  let moneyInSen = 0;
  let moneyOutSen = 0;
  if (periodFrom <= to) {
    for (const m of mine) {
      if (m.date < periodFrom || m.date > to) continue;
      if (m.amountSen >= 0) moneyInSen += m.amountSen;
      else moneyOutSen += -m.amountSen;
    }
  }

  return {
    accountId: account.id,
    openingSen,
    moneyInSen,
    moneyOutSen,
    closingSen: openingSen + moneyInSen - moneyOutSen,
  };
}

function sumBetween(movements: AccountMovement[], from: string, to: string): number {
  let sum = 0;
  for (const m of movements) {
    if (m.date >= from && m.date <= to) sum += m.amountSen;
  }
  return sum;
}

/** The account's balance as of a single date (dashboard's "current balance"). */
export function currentBalanceSen(
  account: { id: string; openingBalanceSen: number; openingDate: string },
  movements: AccountMovement[],
  asOfDate: string,
): number {
  return summarizeAccountPeriod(account, movements, account.openingDate, asOfDate).closingSen;
}

/** First active account of a given type, ordered by displayOrder — the
 * resolution rule for the night report's implicit channels (see
 * buildAccountMovements below). Null if no active account of that type
 * exists yet. */
export function resolveAccountIdByType(
  accounts: { id: string; type: AccountType; active: boolean; displayOrder: number }[],
  type: AccountType,
): string | null {
  const candidates = accounts
    .filter((a) => a.active && a.type === type)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return candidates[0]?.id ?? null;
}

// --- Classification: raw records -> signed, dated, labelled movements -----

export interface NightReportMovementInput {
  date: string;
  varianceSen?: number;
  collections: {
    cashSen: number;
    cardSen: number;
    transferSen: number;
    ewalletSen: number;
    refundsSen: number;
  };
  cash: { bankedInSen: number };
  expenses: { amountSen: number; paidBy: (typeof PAID_BY)[number] }[];
}

export interface ExplicitMovementInput {
  date: string;
  // Always positive except salaryPaymentsPaid, where a snapshot netSen may
  // be negative ("over-deducted" — surfaced as-is, never clamped, same as
  // salary already shows it). Direction is otherwise implied by which array
  // this record is passed in.
  amountSen: number;
  paymentMethodId: string | null;
  label: string;
}

export interface AccountMovementInputs {
  accounts: { id: string; type: AccountType; active: boolean; displayOrder: number }[];
  /** paymentMethodId -> accountId (or null if that method has no account linked yet). */
  accountIdByPaymentMethod: Map<string, string | null>;
  nightReports: NightReportMovementInput[];
  expenses: ExplicitMovementInput[]; // money out
  revenueEntries: ExplicitMovementInput[]; // money in
  salaryPaymentsPaid: ExplicitMovementInput[]; // money out (netSen may be negative — see below)
  partnerDrawings: ExplicitMovementInput[]; // money out — omit entirely when not including partner movement
  partnerInjections: ExplicitMovementInput[]; // money in — omit entirely when not including partner movement
  otaRemittances: ExplicitMovementInput[]; // money in
}

export interface AccountMovementsResult {
  movements: AccountMovement[];
  /** Money that couldn't be attributed to any account (a payment method with
   * no account link, or a night-report channel with no active account of
   * that type yet) — surfaced, never silently dropped. */
  unattributedSen: number;
}

/**
 * The single classification entry point: given every raw record already
 * fetched from the six sources, resolves each to a signed, dated, labelled
 * movement against one account. Pure — no DB access, fully unit-testable
 * with plain fixture objects. The store layer's only job is to fetch and
 * shape the raw inputs; all the resolution logic (the mapping table this
 * feature exists to implement) lives here.
 */
export function buildAccountMovements(input: AccountMovementInputs): AccountMovementsResult {
  const movements: AccountMovement[] = [];
  let unattributedSen = 0;

  const byType: Record<AccountType, string | null> = {
    cash: resolveAccountIdByType(input.accounts, "cash"),
    bank: resolveAccountIdByType(input.accounts, "bank"),
    ewallet: resolveAccountIdByType(input.accounts, "ewallet"),
  };

  function pushImplicit(accountId: string | null, amountSen: number, date: string, source: string) {
    if (amountSen === 0) return;
    if (accountId) {
      movements.push({ accountId, amountSen, date, source });
    } else {
      unattributedSen += Math.abs(amountSen);
    }
  }

  function pushExplicit(rec: ExplicitMovementInput, signedAmountSen: number) {
    if (signedAmountSen === 0) return;
    const accountId = rec.paymentMethodId
      ? (input.accountIdByPaymentMethod.get(rec.paymentMethodId) ?? null)
      : null;
    if (accountId) {
      movements.push({ accountId, amountSen: signedAmountSen, date: rec.date, source: rec.label });
    } else {
      unattributedSen += Math.abs(signedAmountSen);
    }
  }

  // --- Night reports: the implicit channels, resolved by account type ---
  for (const nr of input.nightReports) {
    const c = nr.collections;
    pushImplicit(byType.cash, c.cashSen, nr.date, "Night report — cash collected");
    pushImplicit(byType.bank, c.cardSen, nr.date, "Night report — card collected");
    pushImplicit(byType.bank, c.transferSen, nr.date, "Night report — transfer collected");
    pushImplicit(byType.ewallet, c.ewalletSen, nr.date, "Night report — e-wallet collected");
    // Refunds always leave the drawer, regardless of how the original
    // payment was received — the existing decided convention in reconcile().
    pushImplicit(byType.cash, -c.refundsSen, nr.date, "Night report — refund paid");

    // Banking cash in is a transfer: one field, two movements.
    const bankedIn = nr.cash.bankedInSen;
    if (bankedIn !== 0) {
      pushImplicit(byType.cash, -bankedIn, nr.date, "Night report — banked in (from drawer)");
      pushImplicit(byType.bank, bankedIn, nr.date, "Night report — banked in (to bank)");
    }

    // Ties the cash account's computed balance to what was actually
    // counted, so it never silently drifts from the real drawer.
    if (nr.varianceSen) {
      pushImplicit(byType.cash, nr.varianceSen, nr.date, "Night report — cash variance");
    }

    for (const e of nr.expenses) {
      const accountId = e.paidBy === "cash" ? byType.cash : byType.bank;
      pushImplicit(accountId, -e.amountSen, nr.date, `Night report — expense (${e.paidBy})`);
    }
  }

  // --- Explicit sources: resolved via paymentMethodId -> accountId ---
  for (const e of input.expenses) pushExplicit(e, -e.amountSen);
  for (const r of input.revenueEntries) pushExplicit(r, r.amountSen);
  // netSen may be negative ("over-deducted") — that flows through as-is,
  // which correctly shows as money *in* rather than being clamped.
  for (const s of input.salaryPaymentsPaid) pushExplicit(s, -s.amountSen);
  for (const d of input.partnerDrawings) pushExplicit(d, -d.amountSen);
  for (const i of input.partnerInjections) pushExplicit(i, i.amountSen);
  for (const o of input.otaRemittances) pushExplicit(o, o.amountSen);

  return { movements, unattributedSen };
}
