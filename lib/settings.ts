/**
 * Property settings. A single document in `propertySettings`. There is no
 * settings UI yet (that comes later), so this returns sensible defaults when
 * the document is absent. The business-day cutoff and the variance threshold
 * are read from here — never hardcoded at call sites.
 */

import { getDb } from "./mongodb";

export interface PropertySettings {
  /** Hour (KL, 0–23) at which a new business day starts. */
  cutoffHour: number;
  /** Cash variance beyond which a written reason is required, in sen. */
  varianceThresholdSen: number;
  /** Revenue-vs-collections gap beyond which a written reason is required, in sen. */
  revenueGapThresholdSen: number;
  /** Per-item expense ceiling (spec §4.5) — above this, a note for the owner is required. */
  expenseCeilingSen: number;
  /**
   * Hours after a business day ends (its cutoff on the following day) beyond
   * which a night report counts as a "late submission" for the monthly report.
   * The house rule is to submit before the shift hands over; this is the
   * threshold that turns a slip into a counted one. Never blocks submission.
   */
  lateSubmissionThresholdHours: number;
  /** Prefill for rooms available on the night report, if known. */
  roomsAvailable: number | null;
  /** Prefill for the opening cash float, in sen, if known. */
  openingFloatSen: number | null;
}

export const DEFAULT_SETTINGS: PropertySettings = {
  cutoffHour: 6,
  varianceThresholdSen: 2000, // RM 20.00
  revenueGapThresholdSen: 5000, // RM 50.00
  expenseCeilingSen: 30000, // RM 300.00
  lateSubmissionThresholdHours: 12,
  roomsAvailable: null,
  openingFloatSen: null,
};

export async function getSettings(): Promise<PropertySettings> {
  const db = await getDb();
  const doc = await db
    .collection("propertySettings")
    .findOne({ _id: "singleton" as unknown as never });
  if (!doc) return { ...DEFAULT_SETTINGS };
  return {
    cutoffHour:
      typeof doc.cutoffHour === "number"
        ? doc.cutoffHour
        : DEFAULT_SETTINGS.cutoffHour,
    varianceThresholdSen:
      typeof doc.varianceThresholdSen === "number"
        ? doc.varianceThresholdSen
        : DEFAULT_SETTINGS.varianceThresholdSen,
    revenueGapThresholdSen:
      typeof doc.revenueGapThresholdSen === "number"
        ? doc.revenueGapThresholdSen
        : DEFAULT_SETTINGS.revenueGapThresholdSen,
    expenseCeilingSen:
      typeof doc.expenseCeilingSen === "number"
        ? doc.expenseCeilingSen
        : DEFAULT_SETTINGS.expenseCeilingSen,
    lateSubmissionThresholdHours:
      typeof doc.lateSubmissionThresholdHours === "number"
        ? doc.lateSubmissionThresholdHours
        : DEFAULT_SETTINGS.lateSubmissionThresholdHours,
    roomsAvailable:
      typeof doc.roomsAvailable === "number" ? doc.roomsAvailable : null,
    openingFloatSen:
      typeof doc.openingFloatSen === "number" ? doc.openingFloatSen : null,
  };
}
