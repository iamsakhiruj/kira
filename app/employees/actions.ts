"use server";

import { requireUser } from "@/lib/auth";
import { ManagerEmployeeInputSchema, OwnerEmployeeInputSchema } from "@/lib/employees";
import { createEmployee, updateEmployee } from "@/lib/employeesStore";
import { AttendanceInputSchema } from "@/lib/attendance";
import { saveAttendance } from "@/lib/attendanceStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Manager sends only the manager-editable fields; owner sends everything.
 * Which schema validates the payload is decided by the actor's own role,
 * not by a flag the client sets. */
export async function addEmployee(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  if (user.role === "owner") {
    const parsed = OwnerEmployeeInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const { payType, basicAmountSen, fixedAllowancesSen, bankName, bankAccount,
      icOrPassport, nationality, epfNumber, socsoNumber, taxNumber,
      workPermitExpiry, passportExpiry, partnerId, ...managerFields } = parsed.data;
    await createEmployee(
      managerFields,
      { payType, basicAmountSen, fixedAllowancesSen, bankName, bankAccount,
        icOrPassport, nationality, epfNumber, socsoNumber, taxNumber,
        workPermitExpiry, passportExpiry, partnerId },
      { id: user.sub, role: user.role },
    );
    return { ok: true };
  }

  const parsed = ManagerEmployeeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  await createEmployee(parsed.data, null, { id: user.sub, role: user.role });
  return { ok: true };
}

export async function editEmployee(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  // Validate against the schema matching what this role is even allowed to
  // send — updateEmployee() below is the actual server-side enforcement
  // (rejects any key outside the role's allow-list regardless of what
  // validated here), this just gives a better error message for the
  // common, well-behaved case.
  const schema = user.role === "owner" ? OwnerEmployeeInputSchema : ManagerEmployeeInputSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await updateEmployee(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveEmployeeAttendance(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = AttendanceInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the attendance grid." };
  }

  await saveAttendance(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}
