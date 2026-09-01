/**
 * The double-counting rule (Phase 2 §3): "an item recorded in a night
 * report is never also recorded here." A report sums night report lines
 * plus standalone entries where `linkedBusinessDayId` is null — pulled out
 * as its own tested function now, even though the report screen that
 * calls it isn't built until 2.8, so the rule is real, tested logic from
 * the start rather than a convention someone has to remember to apply
 * correctly later.
 */

export interface LinkableEntry {
  amountSen: number;
  linkedBusinessDayId: string | null;
}

/**
 * Sum night-report line amounts plus standalone entries — but only the
 * standalone entries not already represented in a night report. An entry
 * with a non-null `linkedBusinessDayId` is excluded, because it's already
 * counted via the night report line it's linked to.
 */
export function combinedTotalSen(
  nightReportAmountsSen: number[],
  standaloneEntries: LinkableEntry[],
): number {
  const nightTotal = nightReportAmountsSen.reduce((a, b) => a + b, 0);
  const standaloneTotal = standaloneEntries
    .filter((e) => e.linkedBusinessDayId === null)
    .reduce((a, e) => a + e.amountSen, 0);
  return nightTotal + standaloneTotal;
}
