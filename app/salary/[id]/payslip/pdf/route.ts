import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSalaryPayment } from "@/lib/salaryStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import { PayslipConfigSchema, defaultPayslipConfig } from "@/lib/salaryPayments";
import PayslipPdf from "@/lib/pdf/payslipDocument";

export const dynamic = "force-dynamic";

const KL_DATETIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Payslip generation is owner-only, same as the rest of /salary.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAuthorized(user.role, "owner")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const p = await getSalaryPayment(id);
  if (!p) return new NextResponse("Not found", { status: 404 });

  const [methods, company] = await Promise.all([getPaymentMethods(), getCompanyDetails()]);
  const paymentMethodName = p.paymentMethodId
    ? (methods.find((m) => m._id.toString() === p.paymentMethodId)?.name ?? null)
    : null;

  // Reuse the config saved by the editor (so a reprint matches); fall back
  // to the default if none was ever saved (a direct PDF hit with no visit
  // to the editor first).
  const stored = p.payslipConfig ? PayslipConfigSchema.safeParse(p.payslipConfig) : null;
  const config = stored && stored.success ? stored.data : defaultPayslipConfig();

  const buffer = await renderToBuffer(
    PayslipPdf({
      company,
      generatedAtLabel: `${KL_DATETIME.format(new Date())} (KL time)`,
      generatedByName: user.name,
      config,
      employeeName: p.employeeName,
      employeeNumber: p.employeeNumber ?? "",
      position: p.position,
      month: p.month,
      paymentDate: p.paidDate,
      payType: p.payType,
      presentDays: p.presentDays,
      unpaidAbsenceDays: p.unpaidAbsenceDays,
      basicEarnedSen: p.basicEarnedSen,
      allowancesSen: p.allowancesSen,
      overtimeSen: p.overtimeSen ?? 0,
      grossSen: p.grossSen,
      unpaidAbsenceDeductionSen: p.unpaidAbsenceDeductionSen,
      advanceRepaymentSen: p.advanceRepaymentSen,
      statutoryDeductionSen: p.statutoryDeductionSen,
      otherDeductionSen: p.otherDeductionSen,
      otherDeductionNote: p.otherDeductionNote,
      totalDeductionsSen: p.totalDeductionsSen,
      netSen: p.netSen,
      paymentMethodName,
      bankName: p.bankName ?? "",
      bankAccountLast4: p.bankAccountLast4 ?? "",
      directorRemuneration: p.directorRemuneration,
      status: p.status,
    }),
  );

  const filename = `payslip-${p.employeeName.replace(/[^a-z0-9]+/gi, "-")}-${p.month}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
