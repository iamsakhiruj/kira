/**
 * `salaryPayments` DB access. Node runtime only — schema is in the pure
 * `lib/salaryPayments.ts`.
 *
 * A "payroll run" for a month is the set of base documents (one per active
 * employee, `adjustmentOf: null`). Corrections to a *paid* line are separate
 * documents that reference the original via `adjustmentOf`; the original is
 * never mutated. A paid line is immutable — every guard here is server-side.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  SalaryPaymentSchema,
  type SalaryPayment,
} from "./salaryPayments";
import {
  computeSalary,
  countAttendanceDays,
  workingDaysInMonth,
} from "./salary";
import { getEmployeesFull, type StoredEmployee } from "./employeesStore";
import { getAttendanceForMonth } from "./attendanceStore";

export type StoredSalaryPayment = WithId<SalaryPayment>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("salaryPayments");
}

/**
 * One base run per employee per month. The partial filter lets adjustment
 * documents (which carry a non-null `adjustmentOf`) coexist for the same
 * employee and month without tripping the unique index.
 */
export async function ensureSalaryIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex(
    { employeeId: 1, month: 1 },
    { unique: true, partialFilterExpression: { adjustmentOf: null } },
  );
}

interface ManualInputs {
  advanceRepaymentSen: number;
  otherDeductionSen: number;
  otherDeductionNote: string;
  statutoryDeductionSen: number;
  paymentMethodId: string | null;
}

const ZERO_MANUAL: ManualInputs = {
  advanceRepaymentSen: 0,
  otherDeductionSen: 0,
  otherDeductionNote: "",
  statutoryDeductionSen: 0,
  paymentMethodId: null,
};

/** Compute a full salary-line document from an employee, a month's attendance
 * and the manual deduction inputs. Pure assembly around computeSalary(). */
function buildLine(
  employee: StoredEmployee,
  month: string,
  days: { status: string }[],
  manual: ManualInputs,
  meta: {
    status: "draft" | "paid";
    adjustmentOf: string | null;
    createdBy: string;
    createdAt: Date;
    paidBy?: string | null;
    paidAt?: Date | null;
    paidDate?: string | null;
  },
): SalaryPayment {
  const counts = countAttendanceDays(days);
  // Stored/displayed as context for the month. The unpaid-absence deduction
  // itself uses the fixed s.60I divisor (26), not this figure.
  const wd = workingDaysInMonth(month, counts);
  const comp = computeSalary({
    payType: employee.payType,
    basicAmountSen: employee.basicAmountSen,
    fixedAllowancesSen: employee.fixedAllowancesSen,
    presentDays: counts.present,
    unpaidAbsenceDays: counts.unpaid_absence,
    advanceRepaymentSen: manual.advanceRepaymentSen,
    otherDeductionSen: manual.otherDeductionSen,
    statutoryDeductionSen: manual.statutoryDeductionSen,
  });

  return SalaryPaymentSchema.parse({
    employeeId: employee._id.toString(),
    employeeName: employee.name,
    position: employee.position ?? "",
    month,
    payType: employee.payType,
    basicAmountSen: employee.basicAmountSen,
    fixedAllowancesSen: employee.fixedAllowancesSen,
    presentDays: counts.present,
    unpaidAbsenceDays: counts.unpaid_absence,
    workingDaysInMonth: wd,
    basicEarnedSen: comp.basicEarnedSen,
    allowancesSen: comp.allowancesSen,
    grossSen: comp.grossSen,
    unpaidAbsenceDeductionSen: comp.unpaidAbsenceDeductionSen,
    advanceRepaymentSen: comp.advanceRepaymentSen,
    otherDeductionSen: comp.otherDeductionSen,
    otherDeductionNote: manual.otherDeductionNote,
    statutoryDeductionSen: comp.statutoryDeductionSen,
    totalDeductionsSen: comp.totalDeductionsSen,
    netSen: comp.netSen,
    paymentMethodId: manual.paymentMethodId,
    paidDate: meta.paidDate ?? null,
    status: meta.status,
    directorRemuneration: employee.partnerId != null,
    partnerId: employee.partnerId ?? null,
    adjustmentOf: meta.adjustmentOf,
    createdBy: meta.createdBy,
    createdAt: meta.createdAt,
    paidBy: meta.paidBy ?? null,
    paidAt: meta.paidAt ?? null,
  });
}

export interface RunSummary {
  created: number;
  refreshed: number;
  skippedPaid: number;
}

/**
 * Create or refresh the draft run for a month: one base line per *active*
 * employee, computed from their attendance. Re-running preserves manual
 * fields already entered on a draft (advance/other/statutory/payment method)
 * and only recomputes the attendance-driven figures. A line already marked
 * paid is locked and left untouched.
 */
export async function generateOrRefreshDraftRun(
  month: string,
  actor: { id: string; role: Role },
): Promise<RunSummary> {
  const col = await collection();
  const employees = (await getEmployeesFull()).filter(
    (e) => e.status === "active",
  );
  const attendance = await getAttendanceForMonth(month);
  const daysByEmployee = new Map(
    attendance.map((a) => [a.employeeId, a.days as { status: string }[]]),
  );

  const summary: RunSummary = { created: 0, refreshed: 0, skippedPaid: 0 };

  for (const emp of employees) {
    const employeeId = emp._id.toString();
    const existing = (await col.findOne({
      employeeId,
      month,
      adjustmentOf: null,
    })) as StoredSalaryPayment | null;

    if (existing && existing.status === "paid") {
      summary.skippedPaid++;
      continue;
    }

    const manual: ManualInputs = existing
      ? {
          advanceRepaymentSen: existing.advanceRepaymentSen,
          otherDeductionSen: existing.otherDeductionSen,
          otherDeductionNote: existing.otherDeductionNote,
          statutoryDeductionSen: existing.statutoryDeductionSen,
          paymentMethodId: existing.paymentMethodId ?? null,
        }
      : ZERO_MANUAL;

    const doc = buildLine(
      emp,
      month,
      daysByEmployee.get(employeeId) ?? [],
      manual,
      {
        status: "draft",
        adjustmentOf: null,
        createdBy: existing?.createdBy ?? actor.id,
        createdAt: existing?.createdAt ?? new Date(),
      },
    );

    if (existing) {
      const after = await col.findOneAndUpdate(
        { _id: existing._id },
        { $set: doc },
        { returnDocument: "after" },
      );
      await recordAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: "update",
        collection: "salaryPayments",
        documentId: existing._id.toString(),
        before: existing,
        after,
      });
      summary.refreshed++;
    } else {
      const res = await col.insertOne(doc);
      await recordAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create",
        collection: "salaryPayments",
        documentId: res.insertedId.toString(),
        before: null,
        after: doc,
      });
      summary.created++;
    }
  }

  return summary;
}

/** Every line for a month — base runs and any adjustments — for the run table. */
export async function getRun(month: string): Promise<StoredSalaryPayment[]> {
  const col = await collection();
  const docs = await col
    .find({ month })
    .sort({ employeeName: 1, adjustmentOf: 1, createdAt: 1 })
    .toArray();
  return docs as StoredSalaryPayment[];
}

export async function getSalaryPayment(
  id: string,
): Promise<StoredSalaryPayment | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredSalaryPayment | null>;
}

/** All salary payments for one employee, newest month first — used by the
 * partner view to show a linked director's remuneration. */
export async function getSalaryPaymentsForEmployee(
  employeeId: string,
): Promise<StoredSalaryPayment[]> {
  const col = await collection();
  const docs = await col
    .find({ employeeId })
    .sort({ month: -1, createdAt: -1 })
    .toArray();
  return docs as StoredSalaryPayment[];
}

/** Edit a draft line's deductions and payment method. Rejected on a paid line
 * — the net is recomputed from the frozen gross/unpaid snapshot, never
 * hand-typed. */
export async function updateSalaryLine(
  id: string,
  edit: ManualInputs,
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid salary line id.");
  const col = await collection();
  const _id = new ObjectId(id);
  const before = (await col.findOne({ _id })) as StoredSalaryPayment | null;
  if (!before) throw new Error("That salary line no longer exists.");
  if (before.status === "paid") {
    throw new Error("A paid salary line can't be edited. Create an adjustment.");
  }

  const totalDeductionsSen =
    before.unpaidAbsenceDeductionSen +
    edit.advanceRepaymentSen +
    edit.otherDeductionSen +
    edit.statutoryDeductionSen;
  const netSen = before.grossSen - totalDeductionsSen;

  const after = await col.findOneAndUpdate(
    { _id, status: "draft" },
    {
      $set: {
        advanceRepaymentSen: edit.advanceRepaymentSen,
        otherDeductionSen: edit.otherDeductionSen,
        otherDeductionNote: edit.otherDeductionNote,
        statutoryDeductionSen: edit.statutoryDeductionSen,
        paymentMethodId: edit.paymentMethodId,
        totalDeductionsSen,
        netSen,
      },
    },
    { returnDocument: "after" },
  );
  if (!after) {
    // Raced with a mark-paid; the line is now locked.
    throw new Error("That line was just paid and can no longer be edited.");
  }

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "salaryPayments",
    documentId: id,
    before,
    after,
  });
}

/** Mark a draft line paid — this locks it. Guarded on `status: "draft"` so two
 * clicks (or two people) can't pay it twice. Returns false if it was already
 * handled. */
export async function markLinePaid(
  id: string,
  input: { paymentMethodId: string; paidDate: string },
  actor: { id: string; role: Role },
): Promise<boolean> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid salary line id.");
  const col = await collection();
  const _id = new ObjectId(id);
  const before = (await col.findOne({ _id })) as StoredSalaryPayment | null;
  if (!before) throw new Error("That salary line no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id, status: "draft" },
    {
      $set: {
        status: "paid",
        paymentMethodId: input.paymentMethodId,
        paidDate: input.paidDate,
        paidBy: actor.id,
        paidAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!after) return false; // already paid

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "salaryPayments",
    documentId: id,
    before,
    after,
    reason: "salary paid",
  });
  return true;
}

/**
 * Create a correction for a *paid* line: a new draft document referencing the
 * original, recomputed from the employee's current record and attendance (so a
 * fixed grid flows through). The original is never mutated.
 */
export async function createAdjustment(
  originalId: string,
  actor: { id: string; role: Role },
): Promise<string> {
  if (!ObjectId.isValid(originalId)) throw new Error("Invalid salary line id.");
  const col = await collection();
  const original = (await col.findOne({
    _id: new ObjectId(originalId),
  })) as StoredSalaryPayment | null;
  if (!original) throw new Error("That salary line no longer exists.");
  if (original.status !== "paid") {
    throw new Error("Only a paid line needs an adjustment — edit the draft instead.");
  }
  if (original.adjustmentOf) {
    throw new Error("This is already an adjustment. Adjust the original line.");
  }

  const employee = (await getEmployeesFull()).find(
    (e) => e._id.toString() === original.employeeId,
  );
  if (!employee) throw new Error("That employee no longer exists.");

  const attendance = await getAttendanceForMonth(original.month);
  const days =
    (attendance.find((a) => a.employeeId === original.employeeId)
      ?.days as { status: string }[]) ?? [];

  const doc = buildLine(employee, original.month, days, ZERO_MANUAL, {
    status: "draft",
    adjustmentOf: originalId,
    createdBy: actor.id,
    createdAt: new Date(),
  });

  const res = await col.insertOne(doc);
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "correct",
    collection: "salaryPayments",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
    reason: `adjustment of ${originalId}`,
  });
  return res.insertedId.toString();
}
