"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fromSen, toSen, formatRM } from "@/lib/money";
import { PAY_TYPES, EMPLOYEE_STATUSES } from "@/lib/employees";
import { addEmployee, editEmployee } from "./actions";

type PayType = (typeof PAY_TYPES)[number];
type Status = (typeof EMPLOYEE_STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  active: "Active",
  on_leave: "On leave",
  paused: "Paused",
  resigned: "Resigned",
};

/** Manager-editable fields — present for both roles. */
interface ManagerFields {
  id: string;
  name: string;
  position: string;
  department: string;
  joinDate: string;
  status: Status;
  contactPhone: string;
  contactEmail: string;
  notes: string;
}

/** Owner-only fields — present only when role === "owner". */
interface OwnerFields {
  payType: PayType;
  basicAmountSen: number;
  fixedAllowancesSen: number;
  bankName: string;
  bankAccount: string;
  icOrPassport: string;
  nationality: string;
  epfNumber: string;
  socsoNumber: string;
  taxNumber: string;
  workPermitExpiry: string | null;
  passportExpiry: string | null;
}

type EmployeeRow = ManagerFields & Partial<OwnerFields>;

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

function ManagerFieldInputs({
  value,
  onChange,
}: {
  value: Omit<ManagerFields, "id">;
  onChange: (v: Omit<ManagerFields, "id">) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Name</span>
        <input
          aria-label="Name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Position</span>
        <input
          aria-label="Position"
          value={value.position}
          onChange={(e) => onChange({ ...value, position: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Department</span>
        <input
          aria-label="Department"
          value={value.department}
          onChange={(e) => onChange({ ...value, department: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Join date</span>
        <input
          aria-label="Join date"
          type="date"
          value={value.joinDate}
          onChange={(e) => onChange({ ...value, joinDate: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Status</span>
        <select
          aria-label="Status"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as Status })}
          className="h-11 rounded border px-2"
          style={fieldStyle}
        >
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Phone</span>
        <input
          aria-label="Contact phone"
          value={value.contactPhone}
          onChange={(e) => onChange({ ...value, contactPhone: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Email</span>
        <input
          aria-label="Contact email"
          value={value.contactEmail}
          onChange={(e) => onChange({ ...value, contactEmail: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Notes</span>
        <input
          aria-label="Notes"
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
    </div>
  );
}

function OwnerFieldInputs({
  value,
  onChange,
}: {
  value: OwnerFields & { basicAmount: string; fixedAllowances: string };
  onChange: (v: OwnerFields & { basicAmount: string; fixedAllowances: string }) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
      <p className="sm:col-span-3" style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
        Owner only
      </p>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Pay type</span>
        <select
          aria-label="Pay type"
          value={value.payType}
          onChange={(e) => onChange({ ...value, payType: e.target.value as PayType })}
          className="h-11 rounded border px-2"
          style={fieldStyle}
        >
          <option value="monthly">Monthly</option>
          <option value="daily">Daily</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Basic amount (RM)</span>
        <input
          aria-label="Basic amount"
          inputMode="decimal"
          className="money h-11 rounded border px-3"
          style={fieldStyle}
          value={value.basicAmount}
          onChange={(e) => onChange({ ...value, basicAmount: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Fixed allowances (RM)</span>
        <input
          aria-label="Fixed allowances"
          inputMode="decimal"
          className="money h-11 rounded border px-3"
          style={fieldStyle}
          value={value.fixedAllowances}
          onChange={(e) => onChange({ ...value, fixedAllowances: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Bank name</span>
        <input value={value.bankName} onChange={(e) => onChange({ ...value, bankName: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Bank account</span>
        <input value={value.bankAccount} onChange={(e) => onChange({ ...value, bankAccount: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>IC or passport</span>
        <input value={value.icOrPassport} onChange={(e) => onChange({ ...value, icOrPassport: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Nationality</span>
        <input value={value.nationality} onChange={(e) => onChange({ ...value, nationality: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>EPF number</span>
        <input value={value.epfNumber} onChange={(e) => onChange({ ...value, epfNumber: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>SOCSO number</span>
        <input value={value.socsoNumber} onChange={(e) => onChange({ ...value, socsoNumber: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Tax number</span>
        <input value={value.taxNumber} onChange={(e) => onChange({ ...value, taxNumber: e.target.value })} className="h-11 rounded border px-3" style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Work permit expiry</span>
        <input
          type="date"
          value={value.workPermitExpiry ?? ""}
          onChange={(e) => onChange({ ...value, workPermitExpiry: e.target.value || null })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Passport expiry</span>
        <input
          type="date"
          value={value.passportExpiry ?? ""}
          onChange={(e) => onChange({ ...value, passportExpiry: e.target.value || null })}
          className="h-11 rounded border px-3"
          style={fieldStyle}
        />
      </label>
    </div>
  );
}

const BLANK_MANAGER: Omit<ManagerFields, "id"> = {
  name: "",
  position: "",
  department: "",
  joinDate: "",
  status: "active",
  contactPhone: "",
  contactEmail: "",
  notes: "",
};
const BLANK_OWNER: OwnerFields & { basicAmount: string; fixedAllowances: string } = {
  payType: "monthly",
  basicAmount: "",
  fixedAllowances: "",
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
};

function parseMoney(s: string): number | null {
  if (s.trim() === "") return 0;
  try {
    const sen = toSen(s);
    return sen >= 0 ? sen : null;
  } catch {
    return null;
  }
}

function EmployeeForm({
  role,
  initial,
  employeeId,
  onDone,
}: {
  role: "manager" | "owner";
  initial?: EmployeeRow;
  employeeId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [manager, setManager] = useState<Omit<ManagerFields, "id">>(
    initial
      ? {
          name: initial.name,
          position: initial.position,
          department: initial.department,
          joinDate: initial.joinDate,
          status: initial.status,
          contactPhone: initial.contactPhone,
          contactEmail: initial.contactEmail,
          notes: initial.notes,
        }
      : BLANK_MANAGER,
  );
  const [owner, setOwner] = useState(
    initial && initial.payType
      ? {
          payType: initial.payType,
          basicAmount: fromSen(initial.basicAmountSen ?? 0),
          fixedAllowances: fromSen(initial.fixedAllowancesSen ?? 0),
          basicAmountSen: initial.basicAmountSen ?? 0,
          fixedAllowancesSen: initial.fixedAllowancesSen ?? 0,
          bankName: initial.bankName ?? "",
          bankAccount: initial.bankAccount ?? "",
          icOrPassport: initial.icOrPassport ?? "",
          nationality: initial.nationality ?? "",
          epfNumber: initial.epfNumber ?? "",
          socsoNumber: initial.socsoNumber ?? "",
          taxNumber: initial.taxNumber ?? "",
          workPermitExpiry: initial.workPermitExpiry ?? null,
          passportExpiry: initial.passportExpiry ?? null,
        }
      : BLANK_OWNER,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (!manager.name.trim() || !manager.position.trim() || !manager.joinDate) {
      setError("Name, position and join date are required.");
      return;
    }

    let payload: Record<string, unknown> = { ...manager };
    if (role === "owner") {
      const basicAmountSen = parseMoney(owner.basicAmount);
      const fixedAllowancesSen = parseMoney(owner.fixedAllowances);
      if (basicAmountSen === null || fixedAllowancesSen === null) {
        setError("Amounts can't be negative.");
        return;
      }
      payload = {
        ...payload,
        payType: owner.payType,
        basicAmountSen,
        fixedAllowancesSen,
        bankName: owner.bankName,
        bankAccount: owner.bankAccount,
        icOrPassport: owner.icOrPassport,
        nationality: owner.nationality,
        epfNumber: owner.epfNumber,
        socsoNumber: owner.socsoNumber,
        taxNumber: owner.taxNumber,
        workPermitExpiry: owner.workPermitExpiry,
        passportExpiry: owner.passportExpiry,
      };
    }

    setPending(true);
    const res = employeeId
      ? await editEmployee(employeeId, payload)
      : await addEmployee(payload);
    setPending(false);
    if (res.ok) {
      if (!employeeId) setManager(BLANK_MANAGER);
      router.refresh();
      onDone?.();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border p-4" style={fieldStyle}>
      <ManagerFieldInputs value={manager} onChange={setManager} />
      {role === "owner" ? <OwnerFieldInputs value={owner} onChange={setOwner} /> : null}
      {error ? (
        <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="h-11 rounded-card px-4 font-medium"
          style={{ background: "var(--brand)", color: "var(--on-brand)", opacity: pending ? 0.7 : 1 }}
        >
          {pending ? "Saving…" : employeeId ? "Save changes" : "Add employee"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className="h-11 rounded-card px-4" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmployeeRowView({ employee, role }: { employee: EmployeeRow; role: "manager" | "owner" }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="border-b py-3" style={{ borderColor: "var(--border)" }}>
        <EmployeeForm role={role} initial={employee} employeeId={employee.id} onDone={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="p-2">{employee.name}</td>
      <td className="p-2">{employee.position}</td>
      <td className="p-2">{employee.department || "—"}</td>
      <td className="p-2">{STATUS_LABELS[employee.status]}</td>
      {role === "owner" ? (
        <td className="p-2 money">
          {employee.payType === "monthly" ? "Monthly " : "Daily "}
          {formatRM(employee.basicAmountSen ?? 0)}
        </td>
      ) : null}
      <td className="p-2 text-right">
        <button type="button" onClick={() => setEditing(true)} style={{ color: "var(--brand)" }}>
          Edit
        </button>
      </td>
    </tr>
  );
}

export default function EmployeesManager({
  role,
  employees,
}: {
  role: "manager" | "owner";
  employees: EmployeeRow[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "var(--text-label)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Position</th>
              <th className="p-2 text-left">Department</th>
              <th className="p-2 text-left">Status</th>
              {role === "owner" ? <th className="p-2 text-left">Pay</th> : null}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td className="p-2" colSpan={role === "owner" ? 6 : 5} style={{ color: "var(--text-muted)" }}>
                  No employees yet.
                </td>
              </tr>
            ) : (
              employees.map((e) => <EmployeeRowView key={e.id} employee={e} role={role} />)
            )}
          </tbody>
        </table>
      </div>
      {adding ? (
        <EmployeeForm role={role} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-11 self-start rounded-card border px-4"
          style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
        >
          + Add employee
        </button>
      )}
    </div>
  );
}
