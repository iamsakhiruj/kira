/**
 * The /reports PDF export — a real vector-text document (React-PDF), not a
 * screenshot of the page. Rendered server-side only (app/reports/pdf-export/
 * route.ts calls renderToBuffer on this); never imported from a client
 * component. Deliberately decoupled from lib/dailyBreakdown.ts's row types —
 * the route handler flattens whichever grain is on screen (daily or
 * monthly) into the one PdfTableRow shape below, so this file doesn't need
 * to know the difference.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatMoneyDelta, formatOccupancyDelta } from "../periodComparison";
import { formatBusinessDateLabel } from "../businessDate";
import { groupExpenseLedgerByDate, ledgerGrandTotalSen, type ExpenseLedgerLine } from "../expenseLedger";
import { COLORS, sharedStyles, money, CompanyHeader, DocumentTitleBlock, Bar, DocumentFooter } from "./pdfShared";
import type { CompanyDetails } from "../companyDetails";
import type { HeadlineMetrics } from "../reportData";
import type { ChannelSummaryItem } from "../dailyBreakdown";
import type { ReportCategoryAmount } from "../reportData";

export interface PdfTableRow {
  label: string;
  roomsSold: number;
  roomsAvailable: number;
  occupancyRatio: number | null;
  totalRevenueSen: number;
  cashSen: number;
  transferSen: number;
  cardSen: number;
  ewalletSen: number;
  otaReceivableSen: number;
  expensesSen: number;
  varianceSen: number | null;
  statusText: string;
}

export interface PdfTotalsRow {
  roomsSold: number;
  roomsAvailable: number;
  occupancyRatio: number | null;
  totalRevenueSen: number;
  cashSen: number;
  transferSen: number;
  cardSen: number;
  ewalletSen: number;
  otaReceivableSen: number;
  expensesSen: number;
  varianceSen: number;
  statusText: string;
}

export interface ReportPdfProps {
  company: CompanyDetails;
  reportTitle: string;
  periodLabel: string;
  mode: "daily" | "monthly";
  rows: PdfTableRow[];
  totals: PdfTotalsRow;
  headline: HeadlineMetrics;
  previousHeadline: HeadlineMetrics;
  channelSummary: ChannelSummaryItem[];
  expenseCategories: ReportCategoryAmount[];
  expenseLedger: ExpenseLedgerLine[];
  isOwner: boolean;
  generatedAtLabel: string;
  generatedByName: string;
}

const styles = StyleSheet.create({
  // Headline summary
  headlineRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  headlineCard: {
    flex: 1,
    border: `1pt solid ${COLORS.border}`,
    borderRadius: 3,
    padding: 8,
  },
  headlineLabel: { fontSize: 7.5, color: COLORS.muted, marginBottom: 3 },
  headlineValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  headlineDelta: { fontSize: 7, color: COLORS.faint, marginTop: 3 },
  // Main daily/monthly table
  th: {
    flex: 1,
    padding: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  thLabel: { flex: 1.4, textAlign: "left" },
  thStatus: { flex: 1.2, textAlign: "left" },
  td: { flex: 1, padding: 4, fontSize: 7, textAlign: "right" },
  tdLabel: { flex: 1.4, textAlign: "left" },
  tdStatus: { flex: 1.2, textAlign: "left" },
  // Itemised expense ledger — a different column count/shape than the main
  // daily/monthly table, so its own flex ratios rather than reusing .th/.td.
  ledgerTh: { padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold" },
  ledgerTd: { padding: 4, fontSize: 7 },
  ledgerDateCol: { flex: 0.9 },
  ledgerCategoryCol: { flex: 1.1 },
  ledgerNoteCol: { flex: 1.6 },
  ledgerPaidToCol: { flex: 1 },
  ledgerMethodCol: { flex: 1 },
  ledgerAmountCol: { flex: 0.8, textAlign: "right" },
  ledgerCapOpCol: { flex: 0.8, textTransform: "capitalize" },
  ledgerSourceCol: { flex: 0.9 },
  ledgerEnteredByCol: { flex: 1 },
  ledgerGroupRow: { flexDirection: "row", backgroundColor: COLORS.headerBg },
  ledgerGroupLabel: { flex: 1, padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold" },
  ledgerGroupSubtotal: { width: 80, padding: 4, fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "right" },
});

function pct(ratio: number | null): string {
  return ratio !== null ? `${Math.round(ratio * 100)}%` : "—";
}

function TableRow({
  cols,
  bold = false,
}: {
  cols: [string, string, string, string, string, string, string, string, string, string, string, string];
  bold?: boolean;
}) {
  return (
    <View style={[sharedStyles.tr, bold ? sharedStyles.totalsRow : {}]}>
      <Text style={[styles.td, styles.tdLabel]}>{cols[0]}</Text>
      <Text style={styles.td}>{cols[1]}</Text>
      <Text style={styles.td}>{cols[2]}</Text>
      <Text style={styles.td}>{cols[3]}</Text>
      <Text style={styles.td}>{cols[4]}</Text>
      <Text style={styles.td}>{cols[5]}</Text>
      <Text style={styles.td}>{cols[6]}</Text>
      <Text style={styles.td}>{cols[7]}</Text>
      <Text style={styles.td}>{cols[8]}</Text>
      <Text style={styles.td}>{cols[9]}</Text>
      <Text style={styles.td}>{cols[10]}</Text>
      <Text style={[styles.td, styles.tdStatus]}>{cols[11]}</Text>
    </View>
  );
}

function rowToCols(
  r: PdfTableRow | PdfTotalsRow,
  firstLabel: string,
): [string, string, string, string, string, string, string, string, string, string, string, string] {
  return [
    firstLabel,
    `${r.roomsSold} / ${r.roomsAvailable}`,
    pct(r.occupancyRatio),
    money(r.totalRevenueSen),
    money(r.cashSen),
    money(r.transferSen),
    money(r.cardSen),
    money(r.ewalletSen),
    money(r.otaReceivableSen),
    money(r.expensesSen),
    r.varianceSen !== null ? money(r.varianceSen) : "—",
    r.statusText,
  ];
}

// Itemised expenses — grouped by date with a subtotal per day, same shape
// as the on-screen list, so a printed page and the browser never disagree.
function LedgerTable({ lines }: { lines: ExpenseLedgerLine[] }) {
  const groups = groupExpenseLedgerByDate(lines, "desc");
  const grandTotalSen = ledgerGrandTotalSen(lines);

  if (groups.length === 0) {
    return <Text style={{ fontSize: 8, color: COLORS.faint }}>No expenses in this period.</Text>;
  }

  return (
    <View style={sharedStyles.table}>
      <View style={[sharedStyles.tr, sharedStyles.thRow]} fixed>
        <Text style={[styles.ledgerTh, styles.ledgerDateCol]}>Date</Text>
        <Text style={[styles.ledgerTh, styles.ledgerCategoryCol]}>Category</Text>
        <Text style={[styles.ledgerTh, styles.ledgerNoteCol]}>Description / note</Text>
        <Text style={[styles.ledgerTh, styles.ledgerPaidToCol]}>Paid to</Text>
        <Text style={[styles.ledgerTh, styles.ledgerMethodCol]}>Payment method</Text>
        <Text style={[styles.ledgerTh, styles.ledgerAmountCol]}>Amount</Text>
        <Text style={[styles.ledgerTh, styles.ledgerCapOpCol]}>Capital / Op.</Text>
        <Text style={[styles.ledgerTh, styles.ledgerSourceCol]}>Source</Text>
        <Text style={[styles.ledgerTh, styles.ledgerEnteredByCol]}>Entered by</Text>
      </View>
      {groups.map((g) => (
        <View key={g.date}>
          <View style={styles.ledgerGroupRow}>
            <Text style={styles.ledgerGroupLabel}>{formatBusinessDateLabel(g.date)}</Text>
            <Text style={styles.ledgerGroupSubtotal}>{money(g.subtotalSen)}</Text>
          </View>
          {g.lines.map((l, i) => (
            <View key={i} style={sharedStyles.tr}>
              <Text style={[styles.ledgerTd, styles.ledgerDateCol]}>{l.date}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerCategoryCol]}>{l.category}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerNoteCol]}>{l.note || "—"}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerPaidToCol]}>{l.paidTo || "—"}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerMethodCol]}>{l.paymentMethod}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerAmountCol]}>{money(l.amountSen)}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerCapOpCol]}>{l.capitalOrOperating}</Text>
              <Text style={[styles.ledgerTd, styles.ledgerSourceCol]}>
                {l.source === "night" ? "Night report" : "Standalone"}
              </Text>
              <Text style={[styles.ledgerTd, styles.ledgerEnteredByCol]}>{l.enteredBy}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={[styles.ledgerGroupRow, sharedStyles.totalsRow]}>
        <Text style={styles.ledgerGroupLabel}>Grand total</Text>
        <Text style={styles.ledgerGroupSubtotal}>{money(grandTotalSen)}</Text>
      </View>
    </View>
  );
}

export default function ReportPdf({
  company,
  reportTitle,
  periodLabel,
  mode,
  rows,
  totals,
  headline,
  previousHeadline,
  channelSummary,
  expenseCategories,
  expenseLedger,
  isOwner,
  generatedAtLabel,
  generatedByName,
}: ReportPdfProps) {
  const maxCategorySen = expenseCategories.length > 0 ? expenseCategories[0].amountSen : 0;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={sharedStyles.page}>
        <CompanyHeader company={company} />
        <DocumentTitleBlock
          title={reportTitle}
          periodLabel={periodLabel}
          generatedAtLabel={generatedAtLabel}
          generatedByName={generatedByName}
        />

        {/* Headline summary */}
        <View style={styles.headlineRow}>
          <View style={styles.headlineCard}>
            <Text style={styles.headlineLabel}>Revenue</Text>
            <Text style={[styles.headlineValue, { color: COLORS.moneyIn }]}>
              {money(headline.revenueSen)}
            </Text>
            <Text style={styles.headlineDelta}>
              {formatMoneyDelta(headline.revenueSen, previousHeadline.revenueSen)}
            </Text>
          </View>
          <View style={styles.headlineCard}>
            <Text style={styles.headlineLabel}>Expenses</Text>
            <Text style={[styles.headlineValue, { color: COLORS.moneyOut }]}>
              {money(headline.expenseSen)}
            </Text>
            <Text style={styles.headlineDelta}>
              {formatMoneyDelta(headline.expenseSen, previousHeadline.expenseSen)}
            </Text>
          </View>
          {isOwner ? (
            <View style={styles.headlineCard}>
              <Text style={styles.headlineLabel}>Net profit</Text>
              <Text
                style={[
                  styles.headlineValue,
                  { color: headline.profitSen < 0 ? COLORS.moneyOut : COLORS.text },
                ]}
              >
                {money(headline.profitSen)}
              </Text>
              <Text style={styles.headlineDelta}>
                {formatMoneyDelta(headline.profitSen, previousHeadline.profitSen)}
              </Text>
            </View>
          ) : null}
          <View style={styles.headlineCard}>
            <Text style={styles.headlineLabel}>Occupancy</Text>
            <Text style={styles.headlineValue}>{pct(headline.occupancyRatio)}</Text>
            <Text style={styles.headlineDelta}>
              {formatOccupancyDelta(headline.occupancyRatio, previousHeadline.occupancyRatio) ??
                "No data yet"}
            </Text>
          </View>
        </View>

        {/* Collections by channel */}
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>Collections by channel</Text>
          {channelSummary.map((c) => (
            <Bar key={c.channel} label={c.channel} amountSen={c.amountSen} pct={c.pct} />
          ))}
        </View>

        {/* Table */}
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>
            {mode === "daily" ? "Daily breakdown" : "Monthly breakdown"}
          </Text>
          <View style={sharedStyles.table}>
            <View style={[sharedStyles.tr, sharedStyles.thRow]} fixed>
              <Text style={[styles.th, styles.thLabel]}>{mode === "daily" ? "Date" : "Month"}</Text>
              <Text style={styles.th}>Rooms</Text>
              <Text style={styles.th}>Occ. %</Text>
              <Text style={styles.th}>Revenue</Text>
              <Text style={styles.th}>Cash</Text>
              <Text style={styles.th}>QR</Text>
              <Text style={styles.th}>Card</Text>
              <Text style={styles.th}>E-wallet</Text>
              <Text style={styles.th}>OTA</Text>
              <Text style={styles.th}>Expenses</Text>
              <Text style={styles.th}>Variance</Text>
              <Text style={[styles.th, styles.thStatus]}>
                {mode === "daily" ? "Status" : "Reports"}
              </Text>
            </View>
            {rows.map((r, i) => (
              <TableRow key={i} cols={rowToCols(r, r.label)} />
            ))}
            <TableRow cols={rowToCols(totals, "Total")} bold />
          </View>
        </View>

        {/* Expenses by category */}
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>Expenses by category</Text>
          {expenseCategories.length === 0 ? (
            <Text style={{ fontSize: 8, color: COLORS.faint }}>No expenses in this period.</Text>
          ) : (
            expenseCategories.map((c) => (
              <Bar
                key={c.name}
                label={c.name}
                amountSen={c.amountSen}
                pct={maxCategorySen > 0 ? Math.round((c.amountSen / maxCategorySen) * 100) : 0}
              />
            ))
          )}
        </View>

        {/* Itemised expenses — every individual expense, day-grouped with
            subtotals, so a printed handoff never leaves a follow-up
            question about what made up a category total. */}
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>Itemised expenses</Text>
          <LedgerTable lines={expenseLedger} />
        </View>

        <DocumentFooter companyName={company.tradingName} />
      </Page>
    </Document>
  );
}
