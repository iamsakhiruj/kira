import { requireUser } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import { ensureSalaryIndexes, getRun } from "@/lib/salaryStore";
import { ensureEmployeesIndexes, getEmployeesFull } from "@/lib/employeesStore";
import {
  ensurePaymentMethodsIndexes,
  ensurePaymentMethodsSeeded,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";
import SalaryRunManager from "./salary-run-manager";

// Payroll figures are request-time data; never prerender.
export const dynamic = "force-dynamic";

// Current calendar month in KL time, "YYYY-MM". Salary runs are per calendar
// month (not business day), so no cutoff logic applies.
const klMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
});
function currentKLMonth(): string {
  const p = klMonth.formatToParts(new Date());
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  return `${y}-${m}`;
}

export default async function SalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser("owner");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "")
    ? (sp.month as string)
    : currentKLMonth();

  await Promise.all([
    ensureSalaryIndexes(),
    ensureEmployeesIndexes(),
    ensurePaymentMethodsIndexes(),
  ]);
  await ensurePaymentMethodsSeeded();

  const [run, employees, paymentMethods] = await Promise.all([
    getRun(month),
    getEmployeesFull(),
    getPaymentMethods(),
  ]);

  const activeCount = employees.filter((e) => e.status === "active").length;
  const methods = paymentMethods
    .filter((m) => m.active)
    .map((m) => ({ id: m._id.toString(), name: m.name }));
  const methodNames = new Map(
    paymentMethods.map((m) => [m._id.toString(), m.name]),
  );

  const lines = run.map((l) => ({
    id: l._id.toString(),
    employeeName: l.employeeName,
    position: l.position,
    payType: l.payType,
    presentDays: l.presentDays,
    unpaidAbsenceDays: l.unpaidAbsenceDays,
    workingDaysInMonth: l.workingDaysInMonth,
    basicEarnedSen: l.basicEarnedSen,
    allowancesSen: l.allowancesSen,
    grossSen: l.grossSen,
    unpaidAbsenceDeductionSen: l.unpaidAbsenceDeductionSen,
    advanceRepaymentSen: l.advanceRepaymentSen,
    otherDeductionSen: l.otherDeductionSen,
    otherDeductionNote: l.otherDeductionNote,
    statutoryDeductionSen: l.statutoryDeductionSen,
    totalDeductionsSen: l.totalDeductionsSen,
    netSen: l.netSen,
    paymentMethodId: l.paymentMethodId,
    paymentMethodName: l.paymentMethodId
      ? (methodNames.get(l.paymentMethodId) ?? null)
      : null,
    paidDate: l.paidDate,
    status: l.status,
    directorRemuneration: l.directorRemuneration,
    isAdjustment: l.adjustmentOf != null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Salary"
        description="Monthly payroll. This system records what was paid — it does not calculate PCB, EPF, SOCSO or EIS. Enter the statutory total from your accountant. A paid run is locked; correct it with an adjustment."
        animate
      />
      <SalaryRunManager
        month={month}
        activeEmployeeCount={activeCount}
        methods={methods}
        lines={lines}
      />
    </div>
  );
}
