import { getSettings } from "@/lib/settings";
import { businessDateFor } from "@/lib/businessDate";
import { getEmployeeNamesForAttendance } from "@/lib/employeesStore";
import { ensureAttendanceIndexes, getAttendanceForMonth } from "@/lib/attendanceStore";
import AttendanceGrid from "./attendance-grid";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const settings = await getSettings();
  const currentDate = businessDateFor(new Date(), settings.cutoffHour);
  const currentMonth = currentDate.slice(0, 7);

  const { month: requestedMonth } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(requestedMonth ?? "") ? requestedMonth! : currentMonth;

  await ensureAttendanceIndexes();
  const [employees, records] = await Promise.all([
    getEmployeeNamesForAttendance(),
    getAttendanceForMonth(month),
  ]);
  const recordByEmployee = new Map(records.map((r) => [r.employeeId, r.days]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Attendance
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Record-keeping only — no pay is calculated here.
        </p>
      </div>
      <AttendanceGrid
        month={month}
        currentMonth={currentMonth}
        daysInMonth={daysInMonth(month)}
        employees={employees
          .filter((e) => e.status !== "resigned")
          .map((e) => ({
            id: (e as { _id: { toString(): string } })._id.toString(),
            name: e.name,
            days: recordByEmployee.get((e as { _id: { toString(): string } })._id.toString()) ?? [],
          }))}
      />
    </div>
  );
}
