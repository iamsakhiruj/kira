/**
 * `attendance` schema — pure, no database import. One document per
 * employee per month (§3), so a five-person team is five reads for a
 * whole month's grid.
 *
 * No salary calculation happens anywhere in this module — pure record
 * keeping. The Employment Act distinction between paid and unpaid leave
 * (§3: only unpaid_absence reduces a monthly-rated wage) is exactly why
 * the status needs six values, not a simple present/absent — but applying
 * that distinction to a pay figure is Step 2.5's job, not this one's.
 */

import { z } from "zod";

export const DAY_STATUSES = [
  "present",
  "annual_leave",
  "sick_leave",
  "public_holiday",
  "unpaid_absence",
  "rest_day",
] as const;

const monthStr = z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM.");

export const AttendanceDaySchema = z.object({
  day: z.number().int().min(1).max(31),
  status: z.enum(DAY_STATUSES),
  note: z.string().max(200).default(""),
});

export const AttendanceSchema = z.object({
  employeeId: z.string().min(1),
  month: monthStr,
  days: z.array(AttendanceDaySchema),
  updatedBy: z.string().min(1),
  updatedAt: z.date(),
});
export type Attendance = z.infer<typeof AttendanceSchema>;

/** What the client sends to save one employee's month. */
export const AttendanceInputSchema = z.object({
  employeeId: z.string().min(1),
  month: monthStr,
  days: z.array(AttendanceDaySchema),
});
