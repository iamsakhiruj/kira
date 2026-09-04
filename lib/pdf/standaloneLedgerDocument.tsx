/**
 * PDF export shared by /revenue and /expenses — a real vector-text document
 * (React-PDF), same treatment as the /reports PDF: company letterhead,
 * period, totals, formatted for printing. Used for both pages via one
 * generic component; the caller supplies the counterparty column's label
 * ("Received from" vs "Paid to") and, for /revenue only, the extra
 * front-desk-vs-standalone summary lines.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  groupStandaloneLedgerByDate,
  standaloneLedgerGrandTotalSen,
  type StandaloneLedgerLine,
  type StandaloneChannelAmount,
} from "../standaloneLedger";
import { formatBusinessDateLabel } from "../businessDate";
import { COLORS, sharedStyles, money, CompanyHeader, DocumentTitleBlock, Bar, DocumentFooter } from "./pdfShared";
import type { CompanyDetails } from "../companyDetails";

export interface StandaloneLedgerSummaryLine {
  label: string;
  amountSen: number;
}

export interface StandaloneLedgerPdfProps {
  company: CompanyDetails;
  pageTitle: string;
  periodLabel: string;
  generatedAtLabel: string;
  generatedByName: string;
  totalSen: number;
  entryCount: number;
  channelSummary: StandaloneChannelAmount[];
  /** /revenue only: the front-desk vs standalone split, shown so the two
   * are never mistaken for one blended figure. */
  extraSummaryLines?: StandaloneLedgerSummaryLine[];
  counterpartyLabel: string;
  lines: StandaloneLedgerLine[];
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  totalCard: {
    flex: 1,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
    padding: 8,
  },
  totalLabel: { fontSize: 7.5, color: COLORS.muted, marginBottom: 3 },
  totalValue: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  extraLine: { fontSize: 7.5, color: COLORS.muted, marginTop: 3 },
  ledgerTh: { padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold" },
  ledgerTd: { padding: 4, fontSize: 7 },
  dateCol: { flex: 0.9 },
  categoryCol: { flex: 1.1 },
  noteCol: { flex: 1.7 },
  counterpartyCol: { flex: 1.2 },
  methodCol: { flex: 1.1 },
  amountCol: { flex: 0.9, textAlign: "right" },
  enteredByCol: { flex: 1.1 },
  groupRow: { flexDirection: "row", backgroundColor: COLORS.headerBg },
  groupLabel: { flex: 1, padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold" },
  groupSubtotal: { width: 80, padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" },
});

function LedgerTable({ lines, counterpartyLabel }: { lines: StandaloneLedgerLine[]; counterpartyLabel: string }) {
  const groups = groupStandaloneLedgerByDate(lines, "desc");
  const grandTotalSen = standaloneLedgerGrandTotalSen(lines);

  if (groups.length === 0) {
    return <Text style={{ fontSize: 8, color: COLORS.faint }}>No entries in this period.</Text>;
  }

  return (
    <View style={sharedStyles.table}>
      <View style={[sharedStyles.tr, sharedStyles.thRow]} fixed>
        <Text style={[styles.ledgerTh, styles.dateCol]}>Date</Text>
        <Text style={[styles.ledgerTh, styles.categoryCol]}>Category</Text>
        <Text style={[styles.ledgerTh, styles.noteCol]}>Description</Text>
        <Text style={[styles.ledgerTh, styles.counterpartyCol]}>{counterpartyLabel}</Text>
        <Text style={[styles.ledgerTh, styles.methodCol]}>Payment method</Text>
        <Text style={[styles.ledgerTh, styles.amountCol]}>Amount</Text>
        <Text style={[styles.ledgerTh, styles.enteredByCol]}>Entered by</Text>
      </View>
      {groups.map((g) => (
        <View key={g.date}>
          <View style={styles.groupRow}>
            <Text style={styles.groupLabel}>{formatBusinessDateLabel(g.date)}</Text>
            <Text style={styles.groupSubtotal}>{money(g.subtotalSen)}</Text>
          </View>
          {g.lines.map((l) => (
            <View key={l.id} style={sharedStyles.tr}>
              <Text style={[styles.ledgerTd, styles.dateCol]}>{l.date}</Text>
              <Text style={[styles.ledgerTd, styles.categoryCol]}>{l.category}</Text>
              <Text style={[styles.ledgerTd, styles.noteCol]}>{l.note || "—"}</Text>
              <Text style={[styles.ledgerTd, styles.counterpartyCol]}>{l.counterparty || "—"}</Text>
              <Text style={[styles.ledgerTd, styles.methodCol]}>{l.paymentMethod}</Text>
              <Text style={[styles.ledgerTd, styles.amountCol]}>{money(l.amountSen)}</Text>
              <Text style={[styles.ledgerTd, styles.enteredByCol]}>{l.enteredBy}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={[styles.groupRow, sharedStyles.totalsRow]}>
        <Text style={styles.groupLabel}>Grand total</Text>
        <Text style={styles.groupSubtotal}>{money(grandTotalSen)}</Text>
      </View>
    </View>
  );
}

export default function StandaloneLedgerPdf({
  company,
  pageTitle,
  periodLabel,
  generatedAtLabel,
  generatedByName,
  totalSen,
  entryCount,
  channelSummary,
  extraSummaryLines,
  counterpartyLabel,
  lines,
}: StandaloneLedgerPdfProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={sharedStyles.page}>
        <CompanyHeader company={company} />
        <DocumentTitleBlock
          title={pageTitle}
          periodLabel={periodLabel}
          generatedAtLabel={generatedAtLabel}
          generatedByName={generatedByName}
        />

        <View style={styles.summaryRow}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(totalSen)}</Text>
            {extraSummaryLines?.map((l) => (
              <Text key={l.label} style={styles.extraLine}>
                {l.label}: {money(l.amountSen)}
              </Text>
            ))}
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Number of entries</Text>
            <Text style={styles.totalValue}>{entryCount}</Text>
          </View>
        </View>

        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>By payment method</Text>
          {channelSummary.map((c) => (
            <Bar key={c.channel} label={c.channel} amountSen={c.amountSen} pct={c.pct} />
          ))}
        </View>

        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>{pageTitle} — day by day</Text>
          <LedgerTable lines={lines} counterpartyLabel={counterpartyLabel} />
        </View>

        <DocumentFooter companyName={company.tradingName} />
      </Page>
    </Document>
  );
}
