import { requireUser } from "@/lib/auth";
import {
  ensureProfitAllocationIndexes,
  computeMonthNetProfit,
  getAllocationsForMonth,
  getAllAllocations,
} from "@/lib/profitAllocationStore";
import ProfitManager from "./profit-manager";

export const dynamic = "force-dynamic";

// Current calendar month in KL, "YYYY-MM".
const klMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
});
function currentKLMonth(): string {
  const p = klMonth.formatToParts(new Date());
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}`;
}

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser("owner");
  await ensureProfitAllocationIndexes();

  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : currentKLMonth();

  const [profit, monthAllocations, all] = await Promise.all([
    computeMonthNetProfit(month),
    getAllocationsForMonth(month),
    getAllAllocations(),
  ]);

  const allocations = monthAllocations.map((a) => ({
    id: a._id.toString(),
    month: a.month,
    netProfitSen: a.netProfitSen,
    revenueSen: a.revenueSen,
    expenseSen: a.expenseSen,
    status: a.status,
    isAdjustment: a.adjustmentOf != null,
    lockedAt: a.lockedAt ? a.lockedAt.toISOString().slice(0, 10) : null,
    lines: a.lines.map((l) => ({
      partnerId: l.partnerId,
      partnerName: l.partnerName,
      percentageBasisPoints: l.percentageBasisPoints,
      amountSen: l.amountSen,
    })),
  }));

  const history = all
    .filter((a) => a.adjustmentOf == null)
    .map((a) => ({
      month: a.month,
      status: a.status,
      netProfitSen: a.netProfitSen,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Profit allocation
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          A monthly management figure and each partner&apos;s notional share, using
          the share percentages in force at month-end — frozen onto the allocation
          when locked. This is <strong>not a declared dividend</strong>: no money is
          due on close. A dividend is a separate, less frequent event paid from
          post-tax profit.
        </p>
      </div>
      <ProfitManager
        month={month}
        profit={{
          revenueSen: profit.revenueSen,
          expenseSen: profit.expenseSen,
          netProfitSen: profit.netProfitSen,
          dayCount: profit.dayCount,
          unapprovedDayCount: profit.unapprovedDayCount,
        }}
        allocations={allocations}
        history={history}
      />
    </div>
  );
}
