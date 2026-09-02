/**
 * `employees` schema — pure, no database import. DB access lives in
 * `lib/employeesStore.ts`.
 *
 * Field-level write access is split in two, per the owner's explicit
 * instruction — enforced server-side by `updateEmployee()` checking the
 * actor's role against the field names actually present in the change set,
 * not by which inputs a form happens to render:
 *
 *   Manager:     name, position, department, join date, status, contact
 *   Owner only:  pay type, amounts, bank details, IC/passport,
 *                EPF/SOCSO/tax numbers, permit and passport expiry
 *
 * `nationality` and `passportExpiry` aren't explicitly named in either
 * list — grouped into owner-only here alongside work permit expiry, since
 * all three are the same category of sensitive foreign-worker compliance
 * data (spec §3: "Work permit and passport expiry (foreign staff)").
 * `notes` defaults to manager-editable as general operational commentary,
 * not sensitive data on its own. Flagging both as judgment calls, not
 * explicit instructions.
 *
 * Status is `active | on_leave | paused | resigned` — no delete endpoint
 * exists anywhere in this module. A resigned employee keeps their record;
 * "nothing is ever deleted" (§3) is why last year's payroll still adds up.
 */

import { z } from "zod";

export const PAY_TYPES = ["monthly", "daily"] as const;
export const EMPLOYEE_STATUSES = ["active", "on_leave", "paused", "resigned"] as const;

const nonNegSen = z.number().int("Amounts are stored as whole sen.").min(0);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");
const nullableDateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
  .nullable();

export const ManagerEmployeeFieldsSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  position: z.string().trim().min(1, "Enter a position.").max(120),
  department: z.string().max(120).default(""),
  joinDate: dateStr,
  status: z.enum(EMPLOYEE_STATUSES),
  contactPhone: z.string().max(30).default(""),
  contactEmail: z.string().max(120).default(""),
  notes: z.string().max(2000).default(""),
});

export const OwnerOnlyEmployeeFieldsSchema = z.object({
  payType: z.enum(PAY_TYPES),
  basicAmountSen: nonNegSen,
  fixedAllowancesSen: nonNegSen,
  bankName: z.string().max(120).default(""),
  bankAccount: z.string().max(60).default(""),
  icOrPassport: z.string().max(60).default(""),
  nationality: z.string().max(60).default(""),
  epfNumber: z.string().max(60).default(""),
  socsoNumber: z.string().max(60).default(""),
  taxNumber: z.string().max(60).default(""),
  workPermitExpiry: nullableDateStr.default(null),
  passportExpiry: nullableDateStr.default(null),
  /** Link to a partner record (Phase 2 §3: "partners who draw a salary appear
   * here too"). When set, salary paid to this employee is director
   * remuneration and is flagged as such on the payslip so reports can tell it
   * apart. The partners collection is built in 2.6; this holds the id. */
  partnerId: z.string().trim().nullable().default(null),
});

/** Derived from the schemas themselves, not retyped — the allow-list used
 * for server-side enforcement can never drift from what the schemas
 * actually define. */
export const MANAGER_EDITABLE_FIELDS = Object.keys(
  ManagerEmployeeFieldsSchema.shape,
) as (keyof z.infer<typeof ManagerEmployeeFieldsSchema>)[];
export const OWNER_ONLY_FIELDS = Object.keys(
  OwnerOnlyEmployeeFieldsSchema.shape,
) as (keyof z.infer<typeof OwnerOnlyEmployeeFieldsSchema>)[];

export const EmployeeSchema = ManagerEmployeeFieldsSchema.merge(
  OwnerOnlyEmployeeFieldsSchema,
).extend({
  /** Set server-side whenever `status` changes — never client input. */
  statusChangedAt: z.date(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

/** What a manager sends to create or edit — only the fields they're
 * permitted to touch. */
export const ManagerEmployeeInputSchema = ManagerEmployeeFieldsSchema;

/** What an owner sends — the full field set. */
export const OwnerEmployeeInputSchema = ManagerEmployeeFieldsSchema.merge(
  OwnerOnlyEmployeeFieldsSchema,
);
