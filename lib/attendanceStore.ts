/**
 * `attendance` DB access. Node runtime only — see `lib/attendance.ts` for
 * why the schema lives in a separate, pure file.
 */

import { type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import { type Attendance, type AttendanceInputSchema } from "./attendance";

export type StoredAttendance = WithId<Attendance>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("attendance");
}

/** One document per employee per month (§3) — enforced here. */
export async function ensureAttendanceIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ employeeId: 1, month: 1 }, { unique: true });
}

export async function getAttendanceForMonth(month: string): Promise<StoredAttendance[]> {
  const col = await collection();
  const docs = await col.find({ month }).toArray();
  return docs as StoredAttendance[];
}

/** Save is per employee-row, matching the one-doc-per-employee-per-month
 * shape — not per-cell, to avoid 150+ chatty writes for a full grid. */
export async function saveAttendance(
  input: z.infer<typeof AttendanceInputSchema>,
  actor: { id: string; role: Role },
): Promise<void> {
  const col = await collection();
  const before = await col.findOne({
    employeeId: input.employeeId,
    month: input.month,
  });

  const doc: Attendance = {
    ...input,
    updatedBy: actor.id,
    updatedAt: new Date(),
  };

  const after = await col.findOneAndUpdate(
    { employeeId: input.employeeId, month: input.month },
    { $set: doc },
    { upsert: true, returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: before ? "update" : "create",
    collection: "attendance",
    documentId: after!._id.toString(),
    before,
    after,
  });
}
