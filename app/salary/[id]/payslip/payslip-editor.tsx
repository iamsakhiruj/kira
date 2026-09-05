"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRM } from "@/lib/money";
import { PAYSLIP_OPTIONAL_FIELDS, type PayslipConfig, type PayslipOptionalField } from "@/lib/salaryPayments";
import Badge from "@/components/ui/badge";
import FormPanel from "@/components/ui/form-panel";
import { savePayslipConfig } from "../../actions";

const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
};

const OPTIONAL_FIELD_LABELS: Record<PayslipOptionalField, string> = {
  employeeNumber: "Employee number",
  bankAccountLast4: "Bank account (last 4 digits)",
  overtime: "Overtime line",
};

export default function PayslipEditor({
  salaryPaymentId,
  month,
  initialConfig,
  payslip,
}: {
  salaryPaymentId: string;
  month: string;
  initialConfig: PayslipConfig;
  payslip: {
    employeeName: string;
    position: string;
    status: "draft" | "paid";
    netSen: number;
    paymentMethodName: string | null;
  };
}) {
  const [config, setConfig] = useState<PayslipConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setShow(field: PayslipOptionalField, on: boolean) {
    setConfig((c) => ({ ...c, show: { ...c.show, [field]: on } }));
  }

  async function saveAndDownload() {
    setError(null);
    setSaving(true);
    const res = await savePayslipConfig(salaryPaymentId, config);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // The config is now persisted so a reprint matches; open the PDF route
    // in a new tab, which the browser downloads/displays.
    window.open(`/salary/${salaryPaymentId}/payslip/pdf`, "_blank");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>Payslip PDF</h1>
          <p style={{ color: "var(--text-muted)" }}>
            {payslip.employeeName} · {payslip.position || "—"} · {month}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={payslip.status === "paid" ? "neutral" : "muted"}>
            {payslip.status === "paid" ? "Paid" : "Draft"}
          </Badge>
          <Link href={`/salary/${salaryPaymentId}`} style={{ color: "var(--brand)" }}>
            ← Back to payslip
          </Link>
        </div>
      </div>

      <FormPanel title="Remarks &amp; optional fields" error={error} delayMs={0}>
        <p style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          Net pay {formatRM(payslip.netSen)} via {payslip.paymentMethodName ?? "—"}. These options only change
          how the PDF is laid out — pay figures are frozen from the salary run and never edited here.
        </p>
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Remarks (optional — shown on the payslip)
          </span>
          <textarea
            aria-label="Remarks"
            rows={4}
            value={config.remarks}
            onChange={(e) => setConfig((c) => ({ ...c, remarks: e.target.value }))}
            className="rounded-card border p-3"
            style={fieldStyle}
          />
        </label>
        <div className="flex flex-col gap-2">
          <span style={{ fontSize: "var(--text-label)", fontWeight: 600 }}>Optional fields to show</span>
          {PAYSLIP_OPTIONAL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Show ${OPTIONAL_FIELD_LABELS[f]}`}
                checked={config.show[f]}
                onChange={(e) => setShow(f, e.target.checked)}
              />
              <span style={{ fontSize: "var(--text-label)" }}>{OPTIONAL_FIELD_LABELS[f]}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={saveAndDownload}
            className="btn-primary h-11 rounded-card px-4 font-medium"
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save & download PDF"}
          </button>
        </div>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Saved so a later reprint of this payslip matches what was issued.
        </p>
      </FormPanel>
    </div>
  );
}
