/**
 * Payslip PDF — a real vector-text document (React-PDF), owner-only,
 * generated from a salaryPayments line. Every figure comes from the
 * document's own snapshot (never a live employee/attendance lookup) so a
 * paid line's payslip always regenerates identically — see
 * lib/salaryPayments.ts's freeze comment.
 *
 * "Which optional fields to show" is a cosmetic PayslipConfig (see
 * lib/salaryPayments.ts), same pattern as the booking letter's LetterConfig.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatPayrollMonthLabel } from "../salary";
import { COLORS, money, CompanyHeader, DocumentFooter } from "./pdfShared";
import type { CompanyDetails } from "../companyDetails";
import type { PayslipConfig } from "../salaryPayments";

export interface PayslipPdfProps {
  company: CompanyDetails;
  generatedAtLabel: string;
  generatedByName: string;
  config: PayslipConfig;

  employeeName: string;
  employeeNumber: string;
  position: string;
  month: string; // YYYY-MM
  paymentDate: string | null; // YYYY-MM-DD, null if not yet paid

  payType: "monthly" | "daily";
  presentDays: number;
  unpaidAbsenceDays: number;

  basicEarnedSen: number;
  allowancesSen: number;
  overtimeSen: number;
  grossSen: number;

  unpaidAbsenceDeductionSen: number;
  advanceRepaymentSen: number;
  statutoryDeductionSen: number;
  otherDeductionSen: number;
  otherDeductionNote: string;
  totalDeductionsSen: number;
  netSen: number;

  paymentMethodName: string | null;
  bankName: string;
  bankAccountLast4: string;

  directorRemuneration: boolean;
  status: "draft" | "paid";
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: COLORS.text },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  docTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  statusLine: { fontSize: 8.5, color: COLORS.muted, textAlign: "right", marginTop: 3 },
  infoGrid: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 14,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
  },
  infoCol: { flex: 1, padding: 8 },
  infoDivider: { width: 1, backgroundColor: COLORS.border },
  infoLabel: { fontSize: 7, color: COLORS.muted, marginBottom: 1 },
  infoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  panelRow: { flexDirection: "row", gap: 10 },
  panel: { flex: 1, border: `1pt solid ${COLORS.border}`, borderRadius: 3 },
  panelHeader: {
    backgroundColor: COLORS.headerBg,
    padding: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    borderBottom: `1pt solid ${COLORS.border}`,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 6,
    borderBottom: `0.5pt solid ${COLORS.border}`,
  },
  lineLabel: { fontSize: 8.5 },
  lineSub: { fontSize: 7, color: COLORS.muted, marginTop: 1 },
  lineValue: { fontSize: 8.5 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 6,
    backgroundColor: COLORS.headerBg,
  },
  totalLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  netCard: {
    marginTop: 12,
    padding: 10,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
    backgroundColor: COLORS.headerBg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  netValue: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  metaCol: { flex: 1, fontSize: 8.5, color: COLORS.muted },
  metaLabel: { fontSize: 7, color: COLORS.faint },
  metaValue: { fontSize: 8.5, color: COLORS.text, marginBottom: 4 },
  remarks: {
    marginTop: 14,
    padding: 8,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
    fontSize: 8.5,
  },
  remarksLabel: { fontSize: 7, color: COLORS.muted, marginBottom: 3 },
  legal: {
    marginTop: 10,
    fontSize: 7,
    color: COLORS.faint,
  },
});

function Line({ label, sub, valueSen, negative }: { label: string; sub?: string; valueSen: number; negative?: boolean }) {
  return (
    <View style={styles.lineRow}>
      <View>
        <Text style={styles.lineLabel}>{label}</Text>
        {sub ? <Text style={styles.lineSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.lineValue}>{negative ? `− ${money(valueSen)}` : money(valueSen)}</Text>
    </View>
  );
}

export default function PayslipPdf(props: PayslipPdfProps) {
  const {
    company, generatedAtLabel, generatedByName, config,
    employeeName, employeeNumber, position, month, paymentDate,
    payType, presentDays, unpaidAbsenceDays,
    basicEarnedSen, allowancesSen, overtimeSen, grossSen,
    unpaidAbsenceDeductionSen, advanceRepaymentSen, statutoryDeductionSen,
    otherDeductionSen, otherDeductionNote, totalDeductionsSen, netSen,
    paymentMethodName, bankName, bankAccountLast4,
    directorRemuneration, status,
  } = props;

  const basisLabel = payType === "monthly" ? "Monthly-rated" : "Daily-rated";
  const daysLabel =
    payType === "monthly"
      ? `${unpaidAbsenceDays} unpaid absence day${unpaidAbsenceDays === 1 ? "" : "s"}`
      : `${presentDays} day${presentDays === 1 ? "" : "s"} present`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <CompanyHeader company={company} />
          <View>
            <Text style={styles.docTitle}>PAYSLIP</Text>
            <Text style={styles.statusLine}>
              {status === "paid" ? `Paid ${paymentDate ?? "—"}` : "Draft — not yet paid"}
            </Text>
            <Text style={styles.statusLine}>Generated {generatedAtLabel} by {generatedByName}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Employee</Text>
            <Text style={styles.infoValue}>{employeeName}</Text>
            <Text style={styles.infoLabel}>Position</Text>
            <Text style={styles.infoValue}>{position || "—"}</Text>
            {config.show.employeeNumber ? (
              <>
                <Text style={styles.infoLabel}>Employee number</Text>
                <Text style={[styles.infoValue, { marginBottom: 0 }]}>{employeeNumber || "—"}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Pay period</Text>
            <Text style={styles.infoValue}>{formatPayrollMonthLabel(month)}</Text>
            <Text style={styles.infoLabel}>Payment date</Text>
            <Text style={styles.infoValue}>{paymentDate ?? "Not yet paid"}</Text>
            <Text style={styles.infoLabel}>Basis</Text>
            <Text style={[styles.infoValue, { marginBottom: 0 }]}>{basisLabel} · {daysLabel}</Text>
          </View>
        </View>

        {directorRemuneration ? (
          <Text style={{ fontSize: 8, color: COLORS.brand, marginBottom: 8 }}>
            Director remuneration — this employee is linked to a partner record.
          </Text>
        ) : null}

        <View style={styles.panelRow}>
          <View style={styles.panel}>
            <Text style={styles.panelHeader}>Earnings</Text>
            <Line label="Basic" valueSen={basicEarnedSen} />
            <Line label="Allowances" valueSen={allowancesSen} />
            {config.show.overtime ? <Line label="Overtime" valueSen={overtimeSen} /> : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Gross</Text>
              <Text style={styles.totalValue}>{money(grossSen)}</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelHeader}>Deductions</Text>
            <Line
              label="Unpaid absence"
              sub={payType === "monthly" ? `${unpaidAbsenceDays} day${unpaidAbsenceDays === 1 ? "" : "s"}` : undefined}
              valueSen={unpaidAbsenceDeductionSen}
              negative
            />
            <Line label="Advance repayment" valueSen={advanceRepaymentSen} negative />
            <Line label="Statutory deductions" sub="From accountant" valueSen={statutoryDeductionSen} negative />
            <Line
              label="Other"
              sub={otherDeductionSen > 0 ? (otherDeductionNote || undefined) : undefined}
              valueSen={otherDeductionSen}
              negative
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total deductions</Text>
              <Text style={styles.totalValue}>− {money(totalDeductionsSen)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.netCard}>
          <Text style={styles.netLabel}>Net pay</Text>
          <Text style={styles.netValue}>{money(netSen)}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Payment method</Text>
            <Text style={styles.metaValue}>{paymentMethodName ?? "—"}</Text>
          </View>
          {config.show.bankAccountLast4 && (bankName || bankAccountLast4) ? (
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Bank account</Text>
              <Text style={styles.metaValue}>
                {bankName || "—"}{bankAccountLast4 ? ` ···· ${bankAccountLast4}` : ""}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Days worked / unpaid</Text>
            <Text style={styles.metaValue}>
              {presentDays} worked · {unpaidAbsenceDays} unpaid
            </Text>
          </View>
        </View>

        {config.remarks ? (
          <View style={styles.remarks}>
            <Text style={styles.remarksLabel}>Remarks</Text>
            <Text>{config.remarks}</Text>
          </View>
        ) : null}

        <Text style={styles.legal}>
          This system does not calculate PCB, EPF, SOCSO or EIS — the statutory deductions total above is
          entered from the accountant&apos;s figures and recorded as paid, not computed. This payslip is
          computer generated and requires no signature.
        </Text>

        <DocumentFooter companyName={company.tradingName} />
      </Page>
    </Document>
  );
}
