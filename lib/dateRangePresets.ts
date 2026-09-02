/**
 * Date-range preset math shared by /reports and /ota — both use
 * ReportsPicker (app/reports/reports-view.tsx) for the client-side
 * from/to inputs, and both need the server to compute the same canonical
 * "this month" / "last month" / "this year" ranges so the picker's initial
 * state and the server's default range never disagree. Pure string
 * arithmetic on YYYY-MM-DD — no Date-object business-date derivation here
 * (the caller passes in `today`, already computed via businessDateFor()).
 */

export type DateRangePreset = "this_month" | "last_month" | "this_year" | "custom";

/** Last calendar day of a YYYY-MM-DD string's month, as YYYY-MM-DD. */
export function lastDayOfMonthStr(yearStr: string, monthStr: string): string {
  const y = Number(yearStr);
  const m = Number(monthStr);
  // Day 0 of next month = last day of this month
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearStr}-${monthStr}-${String(last).padStart(2, "0")}`;
}

/** First … last day of the KL business-date's month. */
export function thisMonthRange(today: string): { from: string; to: string } {
  const [y, m] = today.split("-");
  return { from: `${y}-${m}-01`, to: lastDayOfMonthStr(y, m) };
}

/** Which preset (if any) the given range exactly matches, relative to today. */
export function detectPreset(
  from: string,
  to: string,
  today: string,
): DateRangePreset {
  const tm = thisMonthRange(today);
  if (from === tm.from && to === tm.to) return "this_month";

  const [ty, tm2] = today.split("-").map(Number);
  const prevM = tm2 === 1 ? 12 : tm2 - 1;
  const prevY = tm2 === 1 ? ty - 1 : ty;
  const prevMonthFrom = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const prevMonthTo = lastDayOfMonthStr(String(prevY), String(prevM).padStart(2, "0"));
  if (from === prevMonthFrom && to === prevMonthTo) return "last_month";

  const [ys] = today.split("-");
  if (from === `${ys}-01-01` && to === today) return "this_year";

  return "custom";
}

/** Page-subtitle label for a range: a single date, or "from – to". */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return from;
  return `${from} – ${to}`;
}
