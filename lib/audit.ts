/**
 * Every write in this system goes to the audit log: who, when, what
 * collection, what document, and the before/after values. No exceptions,
 * including the owner's own edits. This is a cash-handling system — the log
 * is the point (CLAUDE.md rule 4).
 *
 * The entry is built and validated by a pure function so it can be unit
 * tested without a database; `writeAudit` is the thin layer that persists it.
 */

import { z } from "zod";
import { getDb } from "./mongodb";

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "approve",
  "query",
  "void",
  "correct",
] as const;

export const AuditEntrySchema = z.object({
  /** _id of the user who made the change. */
  actorId: z.string().min(1, "audit: actorId is required"),
  /** Their role at the time, for quick filtering. */
  actorRole: z.enum(["reception", "manager", "owner"]).optional(),
  action: z.enum(AUDIT_ACTIONS),
  /** The collection written to, e.g. "businessDays". */
  collection: z.string().min(1, "audit: collection is required"),
  /** _id of the affected document, as a string. */
  documentId: z.string().min(1, "audit: documentId is required"),
  /** State before the write; null for a create. */
  before: z.unknown().nullable(),
  /** State after the write; null for a delete. */
  after: z.unknown().nullable(),
  /** When it happened (a real instant). */
  at: z.date(),
  /** Why, where a reason is meaningful (a query, a correction, a void). */
  reason: z.string().optional(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** Input to build an entry. `at` defaults to now if omitted. */
export type AuditInput = Omit<AuditEntry, "at"> & { at?: Date };

/**
 * Build and validate an audit entry. Pure and deterministic when `at` is
 * supplied. Throws (via Zod) if a required field is missing.
 */
export function buildAuditEntry(input: AuditInput): AuditEntry {
  return AuditEntrySchema.parse({ ...input, at: input.at ?? new Date() });
}

/** The minimum surface of a Mongo collection this module needs. */
export interface AuditSink {
  insertOne(doc: AuditEntry): Promise<{ insertedId: unknown }>;
}

/**
 * Persist an audit entry. Every mutation calls this. Returns the inserted id.
 */
export async function writeAudit(
  sink: AuditSink,
  input: AuditInput,
): Promise<unknown> {
  const entry = buildAuditEntry(input);
  const { insertedId } = await sink.insertOne(entry);
  return insertedId;
}

/**
 * Convenience for application code: write to the `auditLog` collection in the
 * app database. Server (Node) runtime only. Tests use writeAudit with a fake
 * sink instead, so they never touch a database.
 */
export async function recordAudit(input: AuditInput): Promise<unknown> {
  const db = await getDb();
  return writeAudit(db.collection("auditLog") as unknown as AuditSink, input);
}
