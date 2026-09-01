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

/**
 * The business date one calendar day before the given one. Used to offer
 * reception "yesterday" when a night report was missed. Handles month and
 * year boundaries.
 */
export function previousBusinessDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) {
    throw new Error("previousBusinessDate: date must be YYYY-MM-DD.");
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
