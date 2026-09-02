/**
 * Login lockout schedule — pure and deterministic so it can be unit-tested
 * without a database (same split as lib/passwordPolicy.ts). DB access lives
 * in lib/loginRateLimitStore.ts.
 *
 * Applied independently to two counters (attempted email, source IP) —
 * either one being locked blocks the attempt. 5 failures triggers the
 * first lockout; every additional 5 failures escalates the window, capped
 * at an hour.
 */

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_SCHEDULE_MINUTES = [1, 5, 15, 60];

/**
 * The lockout length, in minutes, for a given failure count — or null if
 * the count hasn't reached the threshold yet. Every additional
 * LOCKOUT_THRESHOLD failures moves one step further down the schedule,
 * capped at the last entry.
 */
export function lockoutDurationMinutes(failureCount: number): number | null {
  if (failureCount < LOCKOUT_THRESHOLD) return null;
  const level = Math.floor(failureCount / LOCKOUT_THRESHOLD) - 1;
  const idx = Math.min(level, LOCKOUT_SCHEDULE_MINUTES.length - 1);
  return LOCKOUT_SCHEDULE_MINUTES[idx];
}
