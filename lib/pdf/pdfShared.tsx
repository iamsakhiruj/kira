/**
 * Shared building blocks for every /reports-family PDF export (the report
 * itself, and now /revenue and /expenses) — one place for the palette, the
 * company letterhead, the title block, the horizontal-bar renderer and the
 * footer, so every generated document looks like it belongs to the same
 * business rather than three independently-styled ones.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { fromSen } from "../money";
import type { CompanyDetails } from "../companyDetails";

export const COLORS = {
  text: "#1A1A1A",
  muted: "#5B6472",
  faint: "#8A93A0",
  border: "#D8DCE2",
  headerBg: "#F3F4F6",
  brand: "#C2410C",
  moneyIn: "#0F6E56",
  moneyOut: "#A32D2D",
};

export const sharedStyles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: COLORS.text,
  },
  companyBlock: { marginBottom: 12 },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  companyLine: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  titleBlock: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: `1pt solid ${COLORS.border}`,
  },
  docTitle: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  periodLabel: { fontSize: 9, color: COLORS.muted, marginTop: 2 },
  generatedLabel: { fontSize: 7, color: COLORS.faint, marginTop: 2 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 },
  barLabel: { width: 110, fontSize: 7.5 },
  barTrack: { flex: 1, height: 8, backgroundColor: "#EEF0F2", borderRadius: 2 },
  barFill: { height: 8, backgroundColor: COLORS.brand, borderRadius: 2 },
  barValue: { width: 80, fontSize: 7.5, textAlign: "right" },
  barPct: { width: 32, fontSize: 7.5, textAlign: "right", color: COLORS.muted },
  table: { border: `1pt solid ${COLORS.border}` },
  tr: { flexDirection: "row", borderBottom: `1pt solid ${COLORS.border}` },
  thRow: { backgroundColor: COLORS.headerBg },
  totalsRow: { backgroundColor: COLORS.headerBg, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.faint,
    borderTop: `0.5pt solid ${COLORS.border}`,
    paddingTop: 4,
  },
});

export function money(sen: number): string {
  return `RM ${fromSen(sen)}`;
}

export function CompanyHeader({ company }: { company: CompanyDetails }) {
  return (
    <View style={sharedStyles.companyBlock}>
      <Text style={sharedStyles.companyName}>{company.tradingName}</Text>
      <Text style={sharedStyles.companyLine}>SSM {company.ssmNumber || "—"}</Text>
      {company.address ? (
        <Text style={sharedStyles.companyLine}>{company.address.replace(/\n/g, ", ")}</Text>
      ) : null}
      {company.phone ? <Text style={sharedStyles.companyLine}>{company.phone}</Text> : null}
    </View>
  );
}

export function DocumentTitleBlock({
  title,
  periodLabel,
  generatedAtLabel,
  generatedByName,
}: {
  title: string;
  periodLabel: string;
  generatedAtLabel: string;
  generatedByName: string;
}) {
  return (
    <View style={sharedStyles.titleBlock}>
      <Text style={sharedStyles.docTitle}>{title}</Text>
      <Text style={sharedStyles.periodLabel}>Period: {periodLabel}</Text>
      <Text style={sharedStyles.generatedLabel}>
        Generated {generatedAtLabel} by {generatedByName}
      </Text>
    </View>
  );
}

export function Bar({ label, amountSen, pct }: { label: string; amountSen: number; pct: number }) {
  return (
    <View style={sharedStyles.barRow}>
      <Text style={sharedStyles.barLabel}>{label}</Text>
      <View style={sharedStyles.barTrack}>
        <View style={[sharedStyles.barFill, { width: `${Math.max(pct, 0)}%` }]} />
      </View>
      <Text style={sharedStyles.barValue}>{money(amountSen)}</Text>
      <Text style={sharedStyles.barPct}>{pct}%</Text>
    </View>
  );
}

export function DocumentFooter({ companyName }: { companyName: string }) {
  return (
    <View style={sharedStyles.footer} fixed>
      <Text>{companyName}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}
