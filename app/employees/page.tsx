import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  ensureEmployeesIndexes,
  getEmployeesManagerView,
  getEmployeesFull,
} from "@/lib/employeesStore";
import PageHeader from "@/components/ui/page-header";
import EmployeesManager from "./employees-manager";

// Depends on request-time data; never prerender.
export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  // requireUser("manager") is already enforced by this route's layout.tsx;
  // called again here only to read the role for the query-level scoping
  // below — manager and owner get genuinely different DB queries, not the
  // same data with fields hidden in the UI.
  const user = await requireUser("manager");
  await ensureEmployeesIndexes();

  const employees =
    user.role === "owner"
      ? (await getEmployeesFull()).map((e) => ({
          id: e._id.toString(),
          name: e.name,
          employeeNumber: e.employeeNumber,
          position: e.position,
          department: e.department,
          joinDate: e.joinDate,
          status: e.status,
          contactPhone: e.contactPhone,
          contactEmail: e.contactEmail,
          notes: e.notes,
          payType: e.payType,
          basicAmountSen: e.basicAmountSen,
          fixedAllowancesSen: e.fixedAllowancesSen,
          bankName: e.bankName,
          bankAccount: e.bankAccount,
          icOrPassport: e.icOrPassport,
          nationality: e.nationality,
          epfNumber: e.epfNumber,
          socsoNumber: e.socsoNumber,
          taxNumber: e.taxNumber,
          workPermitExpiry: e.workPermitExpiry,
          passportExpiry: e.passportExpiry,
          partnerId: e.partnerId ?? null,
        }))
      : (await getEmployeesManagerView()).map((e) => ({
          id: (e as { _id: { toString(): string } })._id.toString(),
          name: e.name,
          employeeNumber: e.employeeNumber,
          position: e.position,
          department: e.department,
          joinDate: e.joinDate,
          status: e.status,
          contactPhone: e.contactPhone,
          contactEmail: e.contactEmail,
          notes: e.notes,
        }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Employees"
        description={
          user.role === "owner"
            ? "Full records — pay, bank details and compliance data included."
            : "Names, positions and contact details. Pay and compliance data are owner-only."
        }
        action={
          <Link
            href="/employees/attendance"
            className="h-11 self-start rounded-card border px-4"
            style={{
              borderColor: "var(--border-strong)",
              color: "var(--brand)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Attendance
          </Link>
        }
        animate
      />
      <EmployeesManager role={user.role === "owner" ? "owner" : "manager"} employees={employees} />
    </div>
  );
}
