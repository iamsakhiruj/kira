/**
 * Pure functions shared by the /revenue and /expenses pages — filtering,
 * day-grouping and the payment-method channel breakdown for a standalone
 * entry list (the `revenueEntries` or `expenses` collection, on its own —
 * this is NOT the /reports itemised ledger, which combines those with
 * night-report lines). NO database imports; the caller maps its own raw
 * documents (with their own field names — `receivedFrom` vs `paidTo`) into
 * the one common `StandaloneLedgerLine` shape below.
 */

export interface StandaloneLedgerLine {
  id: string;
  date: string;
  category: string;
  note: string;
  /** "Received from" (revenue) or "Paid to" (expenses) — one counterparty
   * field, labelled differently by the caller. */
  counterparty: string;
  paymentMethod: string;
  /** The payment method's raw `type` (cash/bank_transfer/card/ewallet/
   * cheque/other) — needed to classify the channel below; the display name
   * alone isn't enough (a "DuitNow QR" method is type "ewallet"). */
  paymentMethodType: string;
  amountSen: number;
  enteredBy: string;
}

// ---------------------------------------------------------------------------
// Filtering — all optional and combinable, same idiom as the /reports
// itemised ledger (lib/expenseLedger.ts), minus capital/operating (not a
// filter on these two pages).
// ---------------------------------------------------------------------------

export interface StandaloneLedgerFilters {
  category?: string;
  paymentMethod?: string;
  /** Inclusive lower bound, in sen. */
  minAmountSen?: number;
}

export function filterStandaloneLedgerLines(
  lines: StandaloneLedgerLine[],
  filters: StandaloneLedgerFilters,
): StandaloneLedgerLine[] {
  return lines.filter((l) => {
    if (filters.category && l.category !== filters.category) return false;
    if (filters.paymentMethod && l.paymentMethod !== filters.paymentMethod) return false;
    if (filters.minAmountSen !== undefined && l.amountSen < filters.minAmountSen) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Day grouping — "grouped by date with a subtotal per day."
// ---------------------------------------------------------------------------

export interface StandaloneLedgerDayGroup {
  date: string;
  lines: StandaloneLedgerLine[];
  subtotalSen: number;
}

export function groupStandaloneLedgerByDate(
  lines: StandaloneLedgerLine[],
  direction: "asc" | "desc" = "desc",
): StandaloneLedgerDayGroup[] {
  const byDate = new Map<string, StandaloneLedgerLine[]>();
  for (const l of lines) {
    const bucket = byDate.get(l.date);
    if (bucket) bucket.push(l);
    else byDate.set(l.date, [l]);
  }
  const sign = direction === "asc" ? 1 : -1;
  const dates = Array.from(byDate.keys()).sort((a, b) => sign * a.localeCompare(b));
  return dates.map((date) => {
    const dayLines = byDate.get(date)!;
    return { date, lines: dayLines, subtotalSen: dayLines.reduce((s, l) => s + l.amountSen, 0) };
  });
}

export function standaloneLedgerGrandTotalSen(lines: StandaloneLedgerLine[]): number {
  return lines.reduce((s, l) => s + l.amountSen, 0);
}

// ---------------------------------------------------------------------------
// Payment-method channel summary — cash / DuitNow-QR / card / e-wallet /
// bank transfer, each an amount and a percentage of the total. Classified
// by the payment method's real type, with one name-based special case:
// "DuitNow QR" is stored with type "ewallet" (same as Touch 'n Go/GrabPay/
// ShopeePay) but reception and the owner both think of it as its own
// channel, same as CLAUDE.md's night-report collections split treats it.
// ---------------------------------------------------------------------------

export type StandaloneChannel = "Cash" | "DuitNow / QR" | "Card" | "E-wallet" | "Bank transfer" | "Other";

const PRIMARY_CHANNELS: StandaloneChannel[] = [
  "Cash", "DuitNow / QR", "Card", "E-wallet", "Bank transfer",
];

export function classifyStandaloneChannel(
  paymentMethodName: string,
  paymentMethodType: string,
): StandaloneChannel {
  if (paymentMethodType === "cash") return "Cash";
  if (/duitnow|\bqr\b/i.test(paymentMethodName)) return "DuitNow / QR";
  if (paymentMethodType === "card") return "Card";
  if (paymentMethodType === "bank_transfer") return "Bank transfer";
  if (paymentMethodType === "ewallet") return "E-wallet";
  return "Other";
}

export interface StandaloneChannelAmount {
  channel: string;
  amountSen: number;
  pct: number; // 0–100, one decimal place
}

/** Always returns the five primary channels (even at zero, so the card
 * always reads the same five rows) plus "Other" only when it's nonzero —
 * a cheque or an uncategorised method shouldn't vanish from the total. */
export function standaloneChannelSummary(lines: StandaloneLedgerLine[]): StandaloneChannelAmount[] {
  const totals = new Map<StandaloneChannel, number>();
  for (const l of lines) {
    const channel = classifyStandaloneChannel(l.paymentMethod, l.paymentMethodType);
    totals.set(channel, (totals.get(channel) ?? 0) + l.amountSen);
  }
  const grandTotalSen = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  const pct = (amountSen: number) =>
    grandTotalSen > 0 ? Math.round((amountSen / grandTotalSen) * 1000) / 10 : 0;

  const result: StandaloneChannelAmount[] = PRIMARY_CHANNELS.map((channel) => {
    const amountSen = totals.get(channel) ?? 0;
    return { channel, amountSen, pct: pct(amountSen) };
  });
  const otherSen = totals.get("Other") ?? 0;
  if (otherSen > 0) result.push({ channel: "Other", amountSen: otherSen, pct: pct(otherSen) });
  return result;
}
