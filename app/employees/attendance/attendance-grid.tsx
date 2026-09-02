"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DAY_STATUSES } from "@/lib/attendance";
import Card from "@/components/ui/card";
import { saveEmployeeAttendance } from "../actions";

type Status = (typeof DAY_STATUSES)[number];

const STATUS_ABBR: Record<Status, string> = {
  present: "P",
  annual_leave: "AL",
  sick_leave: "SL",
  public_holiday: "PH",
  unpaid_absence: "UA",
  rest_day: "RD",
};

interface DayEntry {
  day: number;
  status: Status;
  note: string;
}

interface EmployeeAttendance {
  id: string;
  name: string;
  days: DayEntry[];
}

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

/** Fills every day 1..daysInMonth, defaulting to "present" where no entry
 * exists yet — most days on a real month are present, so this is less
 * re-typing than defaulting to blank. */
function fillMonth(days: DayEntry[], daysInMonth: number): DayEntry[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return byDay.get(day) ?? { day, status: "present" as Status, note: "" };
  });
}

function EmployeeRow({
  employee,
  daysInMonth,
  month,
}: {
  employee: EmployeeAttendance;
  daysInMonth: number;
  month: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState<DayEntry[]>(() => fillMonth(employee.days, daysInMonth));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function setStatus(day: number, status: Status) {
    setDays((prev) => prev.map((d) => (d.day === day ? { ...d, status } : d)));
    setDirty(true);
  }

  async function save() {
    setError(null);
    setPending(true);
    const res = await saveEmployeeAttendance({
      employeeId: employee.id,
      month,
      days,
    });
    setPending(false);
    if (res.ok) {
      setDirty(false);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="sticky left-0 p-2" style={{ background: "var(--surface)", fontWeight: 600 }}>
        {employee.name}
      </td>
      {days.map((d) => (
        <td key={d.day} className="p-1">
          <select
            aria-label={`${employee.name} day ${d.day}`}
            value={d.status}
            onChange={(e) => setStatus(d.day, e.target.value as Status)}
            className="h-9 w-14 rounded border text-center"
            style={fieldStyle}
          >
            {DAY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_ABBR[s]}
              </option>
            ))}
          </select>
        </td>
      ))}
      <td className="p-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          style={{
            color: dirty ? "var(--brand)" : "var(--text-faint)",
            fontWeight: 600,
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {error ? (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}>{error}</p>
        ) : null}
      </td>
    </tr>
  );
}

function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  return (
    <input
      aria-label="Month"
      type="month"
      value={month}
      onChange={(e) => {
        if (e.target.value) router.push(`/employees/attendance?month=${e.target.value}`);
      }}
      className="h-11 rounded border px-3"
      style={fieldStyle}
    />
  );
}

export default function AttendanceGrid({
  month,
  daysInMonth,
  employees,
}: {
  month: string;
  currentMonth: string;
  daysInMonth: number;
  employees: EmployeeAttendance[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MonthPicker month={month} />
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          P present · AL annual leave · SL sick leave · PH public holiday · UA
          unpaid absence · RD rest day
        </p>
      </div>
      {employees.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No active employees yet.</p>
      ) : (
        <Card tone="neutral" animate className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-collapse" style={{ fontSize: "var(--text-label)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                  <th className="sticky left-0 px-4 py-3 text-left" style={{ background: "var(--page)" }}>
                    Employee
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i + 1} className="p-1 text-center" style={{ minWidth: 56 }}>
                      {i + 1}
                    </th>
                  ))}
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <EmployeeRow key={e.id} employee={e} daysInMonth={daysInMonth} month={month} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
