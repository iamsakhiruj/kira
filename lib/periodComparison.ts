/**
 * Pure "vs previous period" comparison for the /reports headline cards —
 * and, since the on-screen and PDF versions of the report must never say
 * different things, for the PDF export too (lib/pdf/reportDocument.tsx).
 * No database imports. `compareValues` is deliberately generic
 * (current/previous numbers in, a delta out) — it doesn't know or care
 * whether the number is sen, a ratio, or a plain count, so the same
 * function serves revenue, expenses, profit and occupancy alike. The two
 * `format*` functions below turn that into the exact copy both renderers
 * show, using `fromSen` for money — the one non-generic part.
 */

import { fromSen } from "./money";

export interface Comparison {
  currentValue: number;
  previousValue: number;
  deltaValue: number;
  /** Relative change, as a percentage (e.g. 8.3 for +8.3%). Null when the
   * previous value is 0 — a relative change from zero is undefined, not
   * "infinite" or "100%". */
  deltaPct: number | null;
}

export function compareValues(current: number, previous: number): Comparison {
  return {
    currentValue: current,
    previousValue: previous,
    deltaValue: current - previous,
    deltaPct:
      previous !== 0
        ? Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
        : null,
  };
}

/** "+RM 1,234.00 (+8.3%) vs previous period", for a money amount in sen. */
export function formatMoneyDelta(currentSen: number, previousSen: number): string {
  if (previousSen === 0) {
    return currentSen === 0 ? "No change vs previous period" : "No data for previous period";
  }
  const cmp = compareValues(currentSen, previousSen);
  const sign = cmp.deltaValue >= 0 ? "+" : "−";
  const pctText = cmp.deltaPct !== null ? ` (${sign}${Math.abs(cmp.deltaPct)}%)` : "";
  return `${sign}RM ${fromSen(Math.abs(cmp.deltaValue))}${pctText} vs previous period`;
}

/** "+3.2pp vs previous period" — percentage-point change, not a relative %
 * (a relative change of a percentage is confusing), for an occupancy ratio
 * (0..1). Either side being unknown (a range with zero rooms available)
 * reports "no data" rather than a misleading 0. */
export function formatOccupancyDelta(
  current: number | null,
  previous: number | null,
): string | undefined {
  if (current === null) return undefined;
  if (previous === null) return "No data for previous period";
  const deltaPp = Math.round((current - previous) * 1000) / 10;
  if (deltaPp === 0) return "No change vs previous period";
  const sign = deltaPp > 0 ? "+" : "−";
  return `${sign}${Math.abs(deltaPp)}pp vs previous period`;
}
