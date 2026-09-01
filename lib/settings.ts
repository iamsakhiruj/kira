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
  /** Prefill for rooms available on the night report, if known. */
  roomsAvailable: number | null;
  /** Prefill for the opening cash float, in sen, if known. */
  openingFloatSen: number | null;
}

export const DEFAULT_SETTINGS: PropertySettings = {
  cutoffHour: 6,
  varianceThresholdSen: 2000, // RM 20.00
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
    roomsAvailable:
      typeof doc.roomsAvailable === "number" ? doc.roomsAvailable : null,
    openingFloatSen:
      typeof doc.openingFloatSen === "number" ? doc.openingFloatSen : null,
  };
}
