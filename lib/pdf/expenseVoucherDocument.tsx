/**
 * Expense voucher PDF — a real vector-text document (React-PDF). Internal
 * payment record, not an invoice: it documents that the business paid this
 * amount, to whom, for what, with three signature lines for the paper
 * trail. Manager+ (same tier as /expenses itself).
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatBusinessDateLabel } from "../businessDate";
import { amountInWords } from "../money";
import { COLORS, money, CompanyHeader, DocumentFooter } from "./pdfShared";
import type { CompanyDetails } from "../companyDetails";

export interface ExpenseVoucherPdfProps {
  company: CompanyDetails;
  voucherNumber: string;
  generatedAtLabel: string;
  generatedByName: string;

  date: string; // business date, YYYY-MM-DD
  paidTo: string;
  amountSen: number;
  categoryName: string;
  paymentMethodName: string;
  reference: string;
  description: string;
  preparedByName: string;
  receiptUrl: string;
}

const styles = StyleSheet.create({
  page: { padding: 34, fontSize: 9.5, fontFamily: "Helvetica", color: COLORS.text },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  docTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  voucherNo: { fontSize: 10, color: COLORS.muted, textAlign: "right", marginTop: 3 },
  generatedLine: { fontSize: 7.5, color: COLORS.faint, textAlign: "right", marginTop: 2 },
  fieldsGrid: {
    marginTop: 18,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
  },
  fieldRow: { flexDirection: "row", borderBottom: `0.5pt solid ${COLORS.border}` },
  fieldRowLast: { flexDirection: "row" },
  fieldCell: { flex: 1, padding: 8, borderRight: `0.5pt solid ${COLORS.border}` },
  fieldCellLast: { flex: 1, padding: 8 },
  fieldLabel: { fontSize: 7.5, color: COLORS.muted, marginBottom: 2 },
  fieldValue: { fontSize: 10 },
  amountCard: {
    marginTop: 14,
    padding: 10,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
    backgroundColor: COLORS.headerBg,
  },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  amountValue: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  amountWords: { fontSize: 8.5, color: COLORS.muted, marginTop: 4 },
  descBlock: {
    marginTop: 14,
    padding: 10,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
    minHeight: 50,
  },
  descLabel: { fontSize: 7.5, color: COLORS.muted, marginBottom: 4 },
  descValue: { fontSize: 9.5 },
  signRow: { marginTop: 36, flexDirection: "row", justifyContent: "space-between" },
  signBlock: { width: "30%" },
  signLine: { borderTop: `1pt solid ${COLORS.text}`, marginBottom: 4 },
  signLabel: { fontSize: 8, color: COLORS.muted, textAlign: "center" },
  receiptLine: { marginTop: 16, fontSize: 8.5, color: COLORS.muted },
  legal: { marginTop: 16, fontSize: 7, color: COLORS.faint },
});

function Field({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? styles.fieldCellLast : styles.fieldCell}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "—"}</Text>
    </View>
  );
}

export default function ExpenseVoucherPdf({
  company, voucherNumber, generatedAtLabel, generatedByName,
  date, paidTo, amountSen, categoryName, paymentMethodName, reference,
  description, preparedByName, receiptUrl,
}: ExpenseVoucherPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <CompanyHeader company={company} />
          <View>
            <Text style={styles.docTitle}>EXPENSE VOUCHER</Text>
            <Text style={styles.voucherNo}>{voucherNumber}</Text>
            <Text style={styles.generatedLine}>Generated {generatedAtLabel} by {generatedByName}</Text>
          </View>
        </View>

        <View style={styles.fieldsGrid}>
          <View style={styles.fieldRow}>
            <Field label="Date" value={formatBusinessDateLabel(date)} />
            <Field label="Paid to" value={paidTo} last />
          </View>
          <View style={styles.fieldRow}>
            <Field label="Category" value={categoryName} />
            <Field label="Payment method" value={paymentMethodName} last />
          </View>
          <View style={styles.fieldRowLast}>
            <Field label="Reference" value={reference} last />
          </View>
        </View>

        <View style={styles.amountCard}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.amountValue}>{money(amountSen)}</Text>
          </View>
          <Text style={styles.amountWords}>{amountInWords(amountSen)}</Text>
        </View>

        <View style={styles.descBlock}>
          <Text style={styles.descLabel}>Description / reason</Text>
          <Text style={styles.descValue}>{description || "—"}</Text>
        </View>

        {receiptUrl ? (
          <Text style={styles.receiptLine}>Attached receipt: {receiptUrl}</Text>
        ) : null}

        <View style={styles.signRow}>
          <View style={styles.signBlock}>
            <Text> </Text>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Prepared by</Text>
            <Text style={[styles.signLabel, { marginTop: 2 }]}>{preparedByName}</Text>
          </View>
          <View style={styles.signBlock}>
            <Text> </Text>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Approved by</Text>
          </View>
          <View style={styles.signBlock}>
            <Text> </Text>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Received by</Text>
          </View>
        </View>

        <Text style={styles.legal}>
          Internal payment record, not a tax invoice. This voucher is computer generated.
        </Text>

        <DocumentFooter companyName={company.tradingName} />
      </Page>
    </Document>
  );
}
