/**
 * `otaPlatforms` schema and constants — pure, no database import, safe to
 * import from a client component (the night report form needs the list for
 * its platform dropdown). DB access lives in `lib/otaPlatformsStore.ts`,
 * same split as `lib/paymentMethods.ts` / `lib/paymentMethodsStore.ts`.
 *
 * One editable list of the OTAs the hotel sells through, each with a
 * `guestPaysPlatform` default (does the guest pay Agoda directly, or pay us
 * at the desk) — this is the default for a new night-report OTA booking
 * line, always overridable per line (CLAUDE.md's night report section).
 *
 * Nothing is ever hard-deleted — same philosophy as `paymentMethods`.
 * Retiring a platform sets `active: false`; historical booking lines keep
 * referencing its id.
 */

import { z } from "zod";

export const OtaPlatformSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  active: z.boolean(),
  displayOrder: z.number().int(),
  guestPaysPlatform: z.boolean(),
});

export type OtaPlatform = z.infer<typeof OtaPlatformSchema>;

/** What the client sends to create or edit one. */
export const OtaPlatformInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  displayOrder: z.number().int(),
  guestPaysPlatform: z.boolean(),
});

export const DEFAULT_OTA_PLATFORMS: Omit<OtaPlatform, "active">[] = [
  { name: "Agoda", displayOrder: 0, guestPaysPlatform: true },
  { name: "Booking.com", displayOrder: 1, guestPaysPlatform: false },
  { name: "Trip.com", displayOrder: 2, guestPaysPlatform: true },
  { name: "Tiket.com", displayOrder: 3, guestPaysPlatform: false },
  { name: "Traveloka", displayOrder: 4, guestPaysPlatform: false },
];
