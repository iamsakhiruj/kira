/**
 * `correctionRequests` — pure schemas, NO database import.
 *
 * Reception can't edit a submitted report, so they ask. The request and its
 * resolution both land in the audit log. Applying a correction does NOT edit
 * the `businessDays` document — the correctionRequests document IS the
 * adjustment: applying it flips its status to "applied" and records the
 * resolution. The original night report is never mutated (CLAUDE.md rule 5).
 */

import { z } from "zod";

export const CORRECTION_STATUSES = ["open", "applied", "rejected"] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

/** The full stored document. */
export const CorrectionRequestSchema = z.object({
  /** _id of the businessDays document. */
  businessDayId: z.string().min(1),
  /**
   * YYYY-MM-DD business date — copied from the day document so we can display
   * it without re-fetching the day on every list render.
   */
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format."),
  /** User _id of whoever raised the request. */
  requestedBy: z.string().min(1),
  requestedAt: z.date(),
  /** Free-text description of what needs correcting. */
  whatNeedsCorrecting: z.string().min(1).max(500),
  /** Free-text description of what the correct value / situation should be. */
  whatItShouldBe: z.string().min(1).max(500),
  /** Why the correction is needed. */
  reason: z.string().min(1).max(500),
  status: z.enum(CORRECTION_STATUSES),
  /** User _id of whoever resolved the request, or null if still open. */
  resolvedBy: z.string().nullable(),
  resolvedAt: z.date().nullable(),
  /** The reviewer's note — empty string when none given. */
  resolutionNote: z.string().max(500).default(""),
});

export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;

/**
 * What the client sends to raise a correction request. The server derives
 * businessDate, requestedBy, requestedAt, status, and the null-resolved fields.
 */
export const CorrectionRequestInputSchema = z.object({
  businessDayId: z.string().min(1, "Say which business day this is for."),
  whatNeedsCorrecting: z
    .string()
    .trim()
    .min(1, "Say what needs correcting.")
    .max(500, "Keep it under 500 characters."),
  whatItShouldBe: z
    .string()
    .trim()
    .min(1, "Say what it should be.")
    .max(500, "Keep it under 500 characters."),
  reason: z
    .string()
    .trim()
    .min(1, "Say why the correction is needed.")
    .max(500, "Keep it under 500 characters."),
});

export type CorrectionRequestInput = z.infer<typeof CorrectionRequestInputSchema>;

/**
 * Two variants so the note requirement can be expressed clearly in the action:
 *
 * - Apply: note is optional (the manager/owner may explain but doesn't have to).
 * - Reject: note is required ("Add a note explaining the rejection.") — a
 *   rejection without explanation leaves reception with no way forward.
 */
export const ApplyNoteSchema = z.object({
  note: z.string().max(500).default(""),
});

export const RejectNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Add a note explaining the rejection.")
    .max(500, "Keep it under 500 characters."),
});
