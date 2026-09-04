/**
 * Headline cards for /reports — the "answer" the rework brief wants front
 * and centre: revenue, expenses, net profit (owner only), occupancy, each
 * with a plain-text comparison against the immediately preceding period of
 * the same length (lib/periodComparison.ts). No hooks/interactivity here,
 * so this stays a Server Component even though it renders Client Component
 * children (StatTile, Card, Counter) — the same pattern the old page used.
 */

import Counter from "@/components/animated/counter";
import Card from "@/components/ui/card";
import StatTile from "@/components/ui/stat-tile";
import { formatMoneyDelta, formatOccupancyDelta } from "@/lib/periodComparison";
import type { HeadlineMetrics } from "@/lib/reportData";

export default function HeadlineCards({
  headline,
  previousHeadline,
  isOwner,
  exactMonth,
}: {
  headline: HeadlineMetrics;
  previousHeadline: HeadlineMetrics;
  isOwner: boolean;
  exactMonth: string | null;
}) {
  return (
    <div
      className={`grid min-w-0 grid-cols-1 gap-3 ${isOwner ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      <StatTile
        animate
        label="Revenue"
        value={headline.revenueSen}
        tone="revenue"
        delta={formatMoneyDelta(headline.revenueSen, previousHeadline.revenueSen)}
        delayMs={0}
      />
      <StatTile
        animate
        label="Expenses"
        value={headline.expenseSen}
        tone="expense"
        delta={formatMoneyDelta(headline.expenseSen, previousHeadline.expenseSen)}
        delayMs={40}
      />
      {isOwner ? (
        <Card tone="brand" animate delayMs={80} className="flex flex-col gap-1 p-4">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            Net profit
          </span>
          <span
            className={`money ${headline.profitSen < 0 ? "money-out" : ""}`}
            style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}
          >
            <Counter value={headline.profitSen} variant="money" prefix="RM " />
          </span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
            {formatMoneyDelta(headline.profitSen, previousHeadline.profitSen)}
          </span>
          {exactMonth ? (
            <a
              href={`/profit?month=${exactMonth}`}
              style={{ fontSize: "var(--text-caption)", color: "var(--brand)" }}
            >
              Allocate this month →
            </a>
          ) : null}
        </Card>
      ) : null}
      <StatTile
        animate
        label="Occupancy"
        value={headline.occupancyRatio !== null ? Math.round(headline.occupancyRatio * 100) : undefined}
        unavailableMessage={headline.occupancyRatio === null ? "No data yet" : undefined}
        variant="percent"
        tone="neutral"
        delta={formatOccupancyDelta(headline.occupancyRatio, previousHeadline.occupancyRatio)}
        delayMs={isOwner ? 120 : 80}
      />
    </div>
  );
}
