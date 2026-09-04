/**
 * "Expenses by category" — item 4 on /reports. `expenseCategories` from
 * lib/reportData.ts is already sorted largest-first (expensesByCategory in
 * lib/reportSummary.ts). Bars, not a pie/donut, per the design system.
 */

import GrowBar from "@/components/animated/grow-bar";
import { fromSen } from "@/lib/money";
import type { ReportCategoryAmount } from "@/lib/reportData";

export default function ExpenseBars({ categories }: { categories: ReportCategoryAmount[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>Expenses by category</h2>
      {categories.length === 0 ? (
        <p style={{ color: "var(--text-faint)" }}>No expenses in this period.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((c) => {
            const pct =
              categories[0].amountSen > 0
                ? Math.round((c.amountSen / categories[0].amountSen) * 100)
                : 0;
            return (
              <div key={c.name} className="flex items-center gap-2" style={{ fontSize: "var(--text-label)" }}>
                <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>{c.name}</span>
                <div className="bar-track" style={{ flex: 1, height: 20 }}>
                  <GrowBar pct={pct} className="bar-fill bar-fill-expense" style={{ height: 20 }} />
                </div>
                <span className="money" style={{ width: 110, flexShrink: 0 }}>
                  RM {fromSen(c.amountSen)}
                </span>
              </div>
            );
          })}
          <div
            className="flex items-center gap-2 border-t pt-2"
            style={{ borderColor: "var(--border)", fontSize: "var(--text-label)", fontWeight: 600 }}
          >
            <span style={{ width: 180, minWidth: 120, flexShrink: 0 }}>Total</span>
            <div style={{ flex: 1 }} />
            <span className="money" style={{ width: 110, flexShrink: 0 }}>
              RM {fromSen(categories.reduce((s, c) => s + c.amountSen, 0))}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
