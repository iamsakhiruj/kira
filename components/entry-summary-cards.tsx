"use client";

/**
 * Shared summary block for /revenue and /expenses: total, an optional set
 * of extra lines under it (used by /revenue for the front-desk-vs-standalone
 * split), a payment-method breakdown (horizontal bars, per the design
 * system's chart rule), and the entry count — for the CURRENTLY FILTERED
 * set of entries, recomputed by the caller on every filter change.
 */

import Card from "./ui/card";
import Counter from "./animated/counter";
import GrowBar from "./animated/grow-bar";
import { fromSen } from "@/lib/money";
import type { StandaloneChannelAmount } from "@/lib/standaloneLedger";

export default function EntrySummaryCards({
  totalSen,
  entryCount,
  channelSummary,
  extraLines,
  tone = "neutral",
}: {
  totalSen: number;
  entryCount: number;
  channelSummary: StandaloneChannelAmount[];
  /** /revenue only: the front-desk vs standalone split, shown so the two
   * numbers are never mistaken for one blended total. */
  extraLines?: { label: string; amountSen: number }[];
  tone?: "revenue" | "expense" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card tone={tone} animate className="flex flex-col gap-1 p-4">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>Total</span>
          <span className="money" style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}>
            <Counter value={totalSen} variant="money" prefix="RM " />
          </span>
          {extraLines?.map((l) => (
            <span key={l.label} style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
              {l.label}: RM {fromSen(l.amountSen)}
            </span>
          ))}
        </Card>
        <Card tone="neutral" animate delayMs={40} className="flex flex-col gap-1 p-4">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Number of entries
          </span>
          <span className="money" style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}>
            <Counter value={entryCount} variant="int" />
          </span>
        </Card>
      </div>

      <Card tone="neutral" animate delayMs={80} className="flex flex-col gap-2 p-4">
        <h3 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>By payment method</h3>
        {channelSummary.map((c) => (
          <div key={c.channel} className="flex items-center gap-2" style={{ fontSize: "var(--text-label)" }}>
            <span style={{ width: 150, minWidth: 120, flexShrink: 0 }}>{c.channel}</span>
            <div className="bar-track" style={{ flex: 1, height: 20 }}>
              <GrowBar pct={c.pct} className="bar-fill bar-fill-revenue" style={{ height: 20 }} />
            </div>
            <span className="money" style={{ width: 110, flexShrink: 0 }}>
              RM {fromSen(c.amountSen)}
            </span>
            <span style={{ width: 48, flexShrink: 0, color: "var(--text-muted)", textAlign: "right" }}>
              {c.pct}%
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
