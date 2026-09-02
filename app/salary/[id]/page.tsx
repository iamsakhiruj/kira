import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatRM } from "@/lib/money";
import { ORDINARY_RATE_DIVISOR } from "@/lib/salary";
import { getSalaryPayment } from "@/lib/salaryStore";
import { getPaymentMethods } from "@/lib/paymentMethodsStore";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";

export const dynamic = "force-dynamic";

function Line({
  label,
  amountSen,
  sub,
  strong,
  tone,
}: {
  label: string;
  amountSen: number;
  sub?: string;
  strong?: boolean;
  tone?: "out" | "net";
}) {
  return (
    <div
      className="flex items-baseline justify-between py-2"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex flex-col">
        <span style={{ fontWeight: strong ? 600 : 400 }}>{label}</span>
        {sub ? (
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>{sub}</span>
        ) : null}
      </div>
      <span
        className="money"
        style={{
          fontWeight: strong ? 600 : 400,
          fontSize: tone === "net" ? "var(--text-section)" : undefined,
          color: tone === "out" ? "var(--text)" : undefined,
        }}
      >
        {tone === "out" ? `− ${formatRM(amountSen)}` : formatRM(amountSen)}
      </span>
    </div>
  );
}

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser("owner");
  const { id } = await params;
  const p = await getSalaryPayment(id);
  if (!p) notFound();

  const methods = await getPaymentMethods();
  const methodName = p.paymentMethodId
    ? (methods.find((m) => m._id.toString() === p.paymentMethodId)?.name ?? "—")
    : "—";

  // Same fix as the run list: the unpaid-absence deduction always uses the
  // fixed Employment Act s.60I ordinary-rate divisor (26), never
  // workingDaysInMonth — pairing the two implied a divisor that was never
  // actually used.
  const basis =
    p.payType === "monthly"
      ? `Monthly-rated · ${p.unpaidAbsenceDays} unpaid absence day${p.unpaidAbsenceDays === 1 ? "" : "s"} at 1/${ORDINARY_RATE_DIVISOR} ordinary rate of pay`
      : `Daily-rated · ${p.presentDays} day${p.presentDays === 1 ? "" : "s"} present`;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href={`/salary?month=${p.month}`} style={{ color: "var(--brand)" }}>
          ← Back to {p.month}
        </Link>
        <Badge tone={p.status === "paid" ? "neutral" : "muted"}>
          {p.status === "paid" ? "Paid" : "Draft"}
        </Badge>
      </div>

      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          {p.employeeName}
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          {p.position || "—"} · Payslip for {p.month}
        </p>
        <p style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>{basis}</p>
        {p.directorRemuneration ? (
          <p
            className="mt-2 rounded-card px-3 py-2"
            style={{ background: "var(--brand-tint)", color: "var(--brand)", fontSize: "var(--text-label)" }}
          >
            Director remuneration — this employee is linked to a partner. Distinguished as such in reports.
          </p>
        ) : null}
        {p.adjustmentOf ? (
          <p
            className="mt-2 rounded-card px-3 py-2"
            style={{ background: "var(--warn-bg)", color: "var(--warn)", fontSize: "var(--text-label)" }}
          >
            Adjustment — a correction referencing an earlier paid payslip.
          </p>
        ) : null}
      </div>

      <Card tone="neutral" animate delayMs={0} className="p-4">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Earnings</h2>
        <Line
          label={p.payType === "monthly" ? "Basic (full monthly)" : "Basic (rate × days present)"}
          amountSen={p.basicEarnedSen}
        />
        <Line label="Fixed allowances" amountSen={p.allowancesSen} />
        <Line label="Gross" amountSen={p.grossSen} strong />
      </Card>

      <Card tone="expense" animate delayMs={40} className="p-4">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Deductions</h2>
        <Line label="Unpaid absence" amountSen={p.unpaidAbsenceDeductionSen} tone="out" />
        <Line label="Advance repayment" amountSen={p.advanceRepaymentSen} tone="out" />
        <Line
          label="Other"
          amountSen={p.otherDeductionSen}
          sub={p.otherDeductionNote || undefined}
          tone="out"
        />
        <Line
          label="Statutory deductions"
          amountSen={p.statutoryDeductionSen}
          sub="Total from accountant — not calculated by this system (PCB/EPF/SOCSO/EIS)"
          tone="out"
        />
        <Line label="Total deductions" amountSen={p.totalDeductionsSen} strong tone="out" />
      </Card>

      <Card tone="brand" animate delayMs={80} className="p-4">
        <Line label="Net pay" amountSen={p.netSen} strong tone="net" />
        {p.netSen < 0 ? (
          <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>
            Net is negative — deductions exceed gross. Review before paying.
          </p>
        ) : null}
        <p className="mt-2" style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          {p.status === "paid"
            ? `Paid ${p.paidDate} via ${methodName}.`
            : `Payment method: ${methodName}. Not yet paid.`}
        </p>
      </Card>
    </div>
  );
}
