/**
 * `otaRemittances` schema — pure, no database import (see
 * `lib/paymentMethods.ts` for the pattern). One document per remittance
 * an OTA platform pays out.
 *
 * Two amounts, not one — this is the precise implementation of "when a
 * remittance is less than the outstanding it covers, the difference is
 * commission": `outstandingCoveredSen` is how much of the platform's
 * balance this remittance is meant to clear (the owner sees the platform's
 * current outstanding and can reduce it if they know this remittance is
 * partial); `amountReceivedSen` is what actually landed. The gap between
 * them, if any, is the commission the platform deducted — surfaced as a
 * prompt (app/ota/ota-client.tsx), never posted automatically.
 *
 * `date` is a plain calendar date, not a business date — a remittance is a
 * bank-side event, not tied to a specific night's shift.
 */

import { z } from "zod";

const nonNegSen = z.number().int("Amounts are stored as whole sen.").min(0);
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

export const OtaRemittanceSchema = z.object({
  platformId: z.string().min(1),
  date: businessDate,
  amountReceivedSen: nonNegSen,
  outstandingCoveredSen: nonNegSen,
  paymentMethodId: z.string().min(1),
  reference: z.string().max(120).default(""),
  note: z.string().max(500).default(""),
  /** User id, set server-side from the session — never client input. */
  recordedBy: z.string().min(1),
  recordedAt: z.date(),
});

export type OtaRemittance = z.infer<typeof OtaRemittanceSchema>;

/** What the client sends to record one. */
export const OtaRemittanceInputSchema = z.object({
  platformId: z.string().min(1, "Choose a platform."),
  date: businessDate,
  amountReceivedSen: z.number().int().min(0, "Amount cannot be negative."),
  outstandingCoveredSen: z.number().int().min(0, "Amount cannot be negative."),
  paymentMethodId: z.string().min(1, "Choose a payment method."),
  reference: z.string().max(120).default(""),
  note: z.string().max(500).default(""),
});
