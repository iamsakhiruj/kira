import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSalaryPayment } from "@/lib/salaryStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import { PayslipConfigSchema, defaultPayslipConfig, type PayslipConfig } from "@/lib/salaryPayments";
import PayslipEditor from "./payslip-editor";

export const dynamic = "force-dynamic";

export default async function PayslipConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser("owner"); // payslip generation is owner-only (CLAUDE.md salary section)
  const { id } = await params;
  const p = await getSalaryPayment(id);
  if (!p) notFound();

  const methods = await getPaymentMethods();
  const paymentMethodName = p.paymentMethodId
    ? (methods.find((m) => m._id.toString() === p.paymentMethodId)?.name ?? null)
    : null;

  // Last-used config (so a reprint matches), else the default — every
  // optional field shown, no remarks. Same pattern as the reservation
  // letter's lastLetterConfig.
  const stored = p.payslipConfig ? PayslipConfigSchema.safeParse(p.payslipConfig) : null;
  const initialConfig: PayslipConfig = stored && stored.success ? stored.data : defaultPayslipConfig();

  return (
    <PayslipEditor
      salaryPaymentId={id}
      month={p.month}
      initialConfig={initialConfig}
      payslip={{
        employeeName: p.employeeName,
        position: p.position,
        status: p.status,
        netSen: p.netSen,
        paymentMethodName,
      }}
    />
  );
}
