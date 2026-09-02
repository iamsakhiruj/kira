/**
 * The business date is a calendar label, not an instant. A night report
 * submitted at 01:30 belongs to the *previous* business day, because the
 * night shift hasn't closed yet.
 *
 * This is the single source of truth for that mapping. The cutoff hour is a
 * parameter (defaults to 06:00) and is never hardcoded elsewhere — it comes
 * from settings. The result is a "YYYY-MM-DD" string in Kuala Lumpur time,
 * never a Date, because a business date has no time-of-day and no timezone.
 */

const KL_TIME_ZONE = "Asia/Kuala_Lumpur";
const DEFAULT_CUTOFF_HOUR = 6;

const klFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23", // 00–23, so midnight is hour 0 rather than 24
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Map an instant to the business date it belongs to, in KL time.
 *
 * @param instant     a real moment in time (e.g. when the report was submitted)
 * @param cutoffHour  the hour (0–23, KL time) at which a new business day
 *                    starts. Anything earlier belongs to the previous day.
 *                    Defaults to 06:00.
 * @returns           the business date as "YYYY-MM-DD"
 */
export function businessDateFor(
  instant: Date,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): string {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new Error("businessDateFor: instant must be a valid Date.");
  }
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new Error("businessDateFor: cutoffHour must be an integer 0–23.");
  }

  const parts = klFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  let year = get("year");
  let month = get("month"); // 1–12
  let day = get("day");
  const hour = get("hour"); // 0–23, KL wall-clock

  if (hour < cutoffHour) {
    // Belongs to the previous KL calendar day. Do the date arithmetic at noon
    // UTC so nothing straddles a day boundary; KL has no DST to complicate it.
    const d = new Date(Date.UTC(year, month - 1, day, 12));
    d.setUTCDate(d.getUTCDate() - 1);
    year = d.getUTCFullYear();
    month = d.getUTCMonth() + 1;
    day = d.getUTCDate();
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseBusinessDate(date: string, fnName: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) {
    throw new Error(`${fnName}: date must be YYYY-MM-DD.`);
  }
  // Noon UTC so subtracting whole days never straddles a boundary.
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

/**
 * `date` minus `n` calendar days, as a business-date string. `n` may be 0
 * (returns `date` unchanged). The general form `previousBusinessDate` is
 * built on (n = 1).
 */
export function businessDateMinusDays(date: string, n: number): string {
  const d = parseBusinessDate(date, "businessDateMinusDays");
  d.setUTCDate(d.getUTCDate() - n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The business date one calendar day before the given one. Used to offer
 * reception "yesterday" when a night report was missed. Handles month and
 * year boundaries.
 */
export function previousBusinessDate(date: string): string {
  return businessDateMinusDays(date, 1);
}

/**
 * The last `days` business dates ending at (and including) `current`,
 * oldest first. e.g. lastBusinessDates("2026-09-07", 3) is
 * ["2026-09-05", "2026-09-06", "2026-09-07"].
 */
export function lastBusinessDates(current: string, days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(businessDateMinusDays(current, i));
  }
  return dates;
}

/**
 * Which of `dates` are worth checking for a missing report, given the
 * earliest report ever submitted was `earliestDate` (null if none exist
 * yet). A property that's only been live for a day has no missing reports
 * from the five days before that — it just hadn't started. If no report
 * has ever been submitted, the only relevant date is `current` itself
 * (today's, not yet due) — there's nothing to backfill.
 */
export function datesSinceFirstReport(
  dates: string[],
  earliestDate: string | null,
  current: string,
): string[] {
  if (earliestDate === null) return [current];
  return dates.filter((d) => d >= earliestDate);
}

/**
 * Whether `role` may submit a night report for `date`, given today's
 * business date is `current`. Nobody may pick a future date. Reception is
 * limited to the last `backfillDays` business dates (today plus the
 * `backfillDays - 1` before it, default 7 total) — older than that needs
 * manager or owner, neither of which has a lower bound (manager can already
 * approve a day, a Phase 1 owner-tier action, so this isn't a new
 * elevation). This is enforced here so the server and any client-side
 * picker bounds share one rule; the server call is the one that actually
 * matters (CLAUDE.md: never trust the client's date).
 */
export function canSubmitDate(
  date: string,
  current: string,
  role: "reception" | "manager" | "owner",
  backfillDays: number = 7,
): boolean {
  if (date > current) return false;
  if (role !== "reception") return true;
  return date > businessDateMinusDays(current, backfillDays);
}

/**
 * The instant a business date *ends* — the cutoff on the following calendar
 * day, in KL time (UTC+8, no DST). Business date D runs [D cutoffHour, D+1
 * cutoffHour), so it ends at D+1 at `cutoffHour` KL. Used to measure how late
 * a night report was filed relative to the shift it covers.
 */
export function endOfBusinessDate(
  date: string,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): Date {
  const d = parseBusinessDate(date, "endOfBusinessDate");
  // D+1 at cutoffHour KL. KL hour H is UTC hour H-8; Date.UTC rolls a negative
  // hour or overflowing day into the correct instant.
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, cutoffHour - 8),
  );
}

/**
 * Hours between when a night report was submitted and when its business date
 * ended (the cutoff the next morning). Negative or ~0 means it was filed
 * during or right at the end of the shift — normal. A large positive value
 * means it was filed well into the next day. A report for 2 Sep submitted at
 * 03:00 on 3 Sep is ~-3h (normal); the same report at 14:00 is +8h.
 *
 * Fractional hours are preserved so the caller can round for display and
 * compare precisely against a threshold.
 */
export function submissionLatenessHours(
  date: string,
  submittedAt: Date,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): number {
  const end = endOfBusinessDate(date, cutoffHour);
  return (submittedAt.getTime() - end.getTime()) / 3_600_000;
}

/**
 * Whether a night report was filed more than `thresholdHours` after its
 * business date ended. This never gates submission — reception can always
 * submit whenever they get to it (CLAUDE.md); it only classifies the timing
 * for the owner's monthly count.
 */
export function isLateSubmission(
  date: string,
  submittedAt: Date,
  thresholdHours: number,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): boolean {
  return submissionLatenessHours(date, submittedAt, cutoffHour) > thresholdHours;
}

// Fixed lookup tables rather than Intl.DateTimeFormat's locale-dependent
// short forms — ICU gives "Sept" for en-GB/en-MY on this runtime, not "Sep",
// which would silently drift from the exact copy this label is used for.
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A human label for a business date, e.g. "2026-09-03" -> "Thu 3 Sep". A
 * business date is already a calendar label (see the module doc), so this
 * reads it as a plain UTC calendar date — no KL/timezone conversion, because
 * there is no instant to convert.
 */
export function formatBusinessDateLabel(date: string): string {
  const d = parseBusinessDate(date, "formatBusinessDateLabel");
  return `${WEEKDAY_LABELS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}`;
}
