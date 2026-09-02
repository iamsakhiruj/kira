/**
 * `employees` DB access. Node runtime only — see `lib/employees.ts` for why
 * the schema lives in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  type Employee,
  type ManagerEmployeeInputSchema,
  type OwnerOnlyEmployeeFieldsSchema,
  MANAGER_EDITABLE_FIELDS,
  OWNER_ONLY_FIELDS,
} from "./employees";

export type StoredEmployee = WithId<Employee>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("employees");
}

export async function ensureEmployeesIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ status: 1 });
}

const OWNER_ONLY_DEFAULTS: z.infer<typeof OwnerOnlyEmployeeFieldsSchema> = {
  payType: "monthly",
  basicAmountSen: 0,
  fixedAllowancesSen: 0,
  bankName: "",
  bankAccount: "",
  icOrPassport: "",
  nationality: "",
  epfNumber: "",
  socsoNumber: "",
  taxNumber: "",
  workPermitExpiry: null,
  passportExpiry: null,
  partnerId: null,
};

/**
 * Create an employee. `ownerFields` is null when the actor is a manager —
 * the owner-only fields get sensible defaults (payType "monthly", amounts
 * zero, everything else empty/null) for the owner to fill in later; a
 * manager-created record is valid immediately, just incomplete on the
 * fields they can't touch.
 */
export async function createEmployee(
  managerFields: z.infer<typeof ManagerEmployeeInputSchema>,
  ownerFields: z.infer<typeof OwnerOnlyEmployeeFieldsSchema> | null,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: Employee = {
    ...managerFields,
    ...(ownerFields ?? OWNER_ONLY_DEFAULTS),
    statusChangedAt: new Date(),
  };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "employees",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId.toString();
}

/**
 * Edit an employee. Enforced per field, server-side: a manager's change
 * set may only contain keys from MANAGER_EDITABLE_FIELDS — not "the form
 * doesn't render those inputs," an actual rejection if the request
 * contains a key outside what the actor's role permits, regardless of
 * what sent it.
 */
export async function updateEmployee(
  id: string,
  changes: Record<string, unknown>,
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid employee id.");

  const allowedKeys: string[] =
    actor.role === "owner"
      ? [...MANAGER_EDITABLE_FIELDS, ...OWNER_ONLY_FIELDS]
      : [...MANAGER_EDITABLE_FIELDS];
  const disallowed = Object.keys(changes).filter((k) => !allowedKeys.includes(k));
  if (disallowed.length > 0) {
    throw new Error(`Not permitted to edit: ${disallowed.join(", ")}.`);
  }

  const col = await collection();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before) throw new Error("That employee no longer exists.");

  const setDoc: Record<string, unknown> = { ...changes };
  if ("status" in changes && changes.status !== before.status) {
    setDoc.statusChangedAt = new Date();
  }

  const after = await col.findOneAndUpdate(
    { _id },
    { $set: setDoc },
    { returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "employees",
    documentId: id,
    before,
    after,
  });
}

/** Manager's view: only the fields they can see and edit — the sensitive
 * fields never leave the database for this query, not fetched-then-hidden. */
export async function getEmployeesManagerView(): Promise<
  (Pick<Employee, (typeof MANAGER_EDITABLE_FIELDS)[number]> & { _id: unknown })[]
> {
  const col = await collection();
  const projection = Object.fromEntries(MANAGER_EDITABLE_FIELDS.map((f) => [f, 1]));
  const docs = await col.find({}, { projection }).sort({ name: 1 }).toArray();
  return docs as (Pick<Employee, (typeof MANAGER_EDITABLE_FIELDS)[number]> & {
    _id: unknown;
  })[];
}

/** Owner's view: everything. */
export async function getEmployeesFull(): Promise<StoredEmployee[]> {
  const col = await collection();
  const docs = await col.find({}).sort({ name: 1 }).toArray();
  return docs as StoredEmployee[];
}

/** For the attendance grid's row labels — name and status only (to grey
 * out resigned staff), regardless of caller role; attendance never needs
 * the sensitive fields. */
export async function getEmployeeNamesForAttendance(): Promise<
  { _id: unknown; name: string; status: Employee["status"] }[]
> {
  const col = await collection();
  const docs = await col
    .find({}, { projection: { name: 1, status: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs as { _id: unknown; name: string; status: Employee["status"] }[];
}
