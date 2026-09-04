/**
 * "Collections by channel" — item 2 on /reports: cash, QR, card, e-wallet,
 * OTA, each as an amount and a percentage of the five-channel total, drawn
 * as a horizontal bar (design system rule: bars, never pie/donut). No
 * hooks here, so this stays a Server Component even though GrowBar is a
 * Client Component — a Server Component may render one as a child.
 */

import Card from "@/components/ui/card";
import GrowBar from "@/components/animated/grow-bar";
import { fromSen } from "@/lib/money";
import type { ChannelSummaryItem } from "@/lib/dailyBreakdown";

export default function ChannelSummary({ items }: { items: ChannelSummaryItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Collections by channel</h2>
      <Card tone="neutral" animate className="flex flex-col gap-2 p-4">
        {items.map((c) => (
          <div
            key={c.channel}
            className="flex items-center gap-2"
            style={{ fontSize: "var(--text-label)" }}
          >
            <span style={{ width: 180, minWidth: 140, flexShrink: 0 }}>{c.channel}</span>
            <div className="bar-track" style={{ flex: 1, height: 20 }}>
              <GrowBar pct={c.pct} className="bar-fill bar-fill-revenue" style={{ height: 20 }} />
            </div>
            <span className="money" style={{ width: 110, flexShrink: 0 }}>
              RM {fromSen(c.amountSen)}
            </span>
            <span
              style={{ width: 48, flexShrink: 0, color: "var(--text-muted)", textAlign: "right" }}
            >
              {c.pct}%
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}
