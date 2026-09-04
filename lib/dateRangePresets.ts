/**
 * Date-range preset math shared by /reports and /ota — both use
 * ReportsPicker (app/reports/reports-view.tsx) for the client-side
 * from/to inputs, and both need the server to compute the same canonical
 * "this month" / "last month" / "this year" ranges so the picker's initial
 * state and the server's default range never disagree. Pure string
 * arithmetic on YYYY-MM-DD — no Date-object business-date derivation here
 * (the caller passes in `today`, already computed via businessDateFor()).
 */

export type DateRangePreset =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

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

/** Just today — the narrowest preset. */
export function todayRange(today: string): { from: string; to: string } {
  return { from: today, to: today };
}

/** Noon-UTC day arithmetic, same idiom as lib/businessDate.ts — used only for
 * the week/previous-period math below, which needs to add/subtract days on
 * a YYYY-MM-DD string without any timezone involved (a business date is
 * already a calendar label, not an instant). */
function parseDateUTC(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error("parseDateUTC: date must be YYYY-MM-DD.");
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function formatDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string {
  const d = parseDateUTC(date);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDateUTC(d);
}

/** Monday … Sunday of the calendar week containing `today`. The caller (the
 * /reports page) clamps `to` to today when this extends into the future,
 * same as thisMonthRange/thisYearRange already do. */
export function thisWeekRange(today: string): { from: string; to: string } {
  const d = parseDateUTC(today);
  const dow = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = addDays(today, -daysSinceMonday);
  const sunday = addDays(monday, 6);
  return { from: monday, to: sunday };
}

/**
 * The immediately preceding period of the same length — "vs previous
 * period" for the headline comparison cards. Works for any range, preset
 * or custom: a 10-day range compares against the 10 days right before it,
 * a calendar month against the month before, a whole year against the
 * year before. Length is measured in calendar days (inclusive), so this
 * needs no knowledge of which preset (if any) produced the range.
 */
export function previousEquivalentRange(
  from: string,
  to: string,
): { from: string; to: string } {
  const days =
    Math.round((parseDateUTC(to).getTime() - parseDateUTC(from).getTime()) / 86_400_000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from: prevFrom, to: prevTo };
}

/** Which preset (if any) the given range exactly matches, relative to today. */
export function detectPreset(
  from: string,
  to: string,
  today: string,
): DateRangePreset {
  if (from === today && to === today) return "today";

  const tw = thisWeekRange(today);
  if (from === tw.from && to === tw.to) return "this_week";

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
