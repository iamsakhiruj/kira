import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor, lastBusinessDates, datesSinceFirstReport } from "@/lib/businessDate";
import {
  getBusinessDaysByDates,
  getPendingBusinessDays,
  getEarliestBusinessDate,
  getBusinessDaysForMonth,
} from "@/lib/businessDays";
import { getRevenueEntriesForMonth } from "@/lib/revenueEntriesStore";
import { getExpensesForMonth } from "@/lib/expensesStore";
import { getAllCategories } from "@/lib/categoriesStore";
import { listPartners, getPartnerBalances } from "@/lib/partnersStore";
import { formatRM, fromSen } from "@/lib/money";
import {
  revenueBySource,
  expensesByCategory,
  netProfitSen,
  occupancy,
  type NightDayDoc,
  type StandaloneEntry,
} from "@/lib/reportSummary";

// Depends on request-time data (approvals, missing days); never prerender.
export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 7;

function toNightDayDoc(doc: Record<string, unknown>): NightDayDoc {
  const rooms = (doc.rooms as NightDayDoc["rooms"]) ?? {
    available: 0, sold: 0, houseUse: 0, revenueSen: 0,
  };
  const revenueLines = (doc.revenueLines as NightDayDoc["revenueLines"]) ?? [];
  const expenses = (doc.expenses as NightDayDoc["expenses"]) ?? [];
  const collections = (doc.collections as NightDayDoc["collections"]) ?? {
    cashSen: 0, cardSen: 0, transferSen: 0, ewalletSen: 0, otaPrepaidSen: 0,
    chargeToAccountSen: 0, depositsSen: 0, refundsSen: 0, receivablesSettledSen: 0,
  };
  const cash = (doc.cash as NightDayDoc["cash"]) ?? {
    openingFloatSen: 0, bankedInSen: 0, countedSen: 0,
  };
  return {
    rooms, revenueLines, expenses, collections, cash,
    varianceSen: typeof doc.varianceSen === "number" ? doc.varianceSen : undefined,
    varianceReason: typeof doc.varianceReason === "string" ? doc.varianceReason : undefined,
    date: typeof doc.date === "string" ? doc.date : undefined,
  };
}

function toStandaloneEntry(doc: Record<string, unknown>): StandaloneEntry {
  return {
    amountSen: (doc.amountSen as number) ?? 0,
    linkedBusinessDayId: (doc.linkedBusinessDayId as string | null) ?? null,
    categoryId: (doc.categoryId as string) ?? "",
    paymentMethodId: (doc.paymentMethodId as string) ?? "",
  };
}

function prevMonthStr(current: string): string {
  const [y, m] = current.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Stat({
  label,
  value,
  unavailableMessage,
  href,
  delta,
}: {
  label: string;
  value?: string;
  unavailableMessage?: string;
  href?: string;
  delta?: string;
}) {
  const body = (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-card border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      {unavailableMessage ? (
        <span style={{ fontSize: "var(--text-body)", color: "var(--text-faint)" }}>
          {unavailableMessage}
        </span>
      ) : (
        <span
          className="money break-all"
          style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}
        >
          {value}
        </span>
      )}
      {delta ? (
        <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          {delta}
        </span>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block min-w-0">
      {body}
    </Link>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}

function deltaLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return "No change vs last month";
  const sign = diff > 0 ? "+" : "−";
  return `${sign}RM ${fromSen(Math.abs(diff))} vs last month`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  const window7 = lastBusinessDates(current, LOOKBACK_DAYS);
  const currentMonth = current.slice(0, 7);
  const lastMonth = prevMonthStr(current);

  const showFinancials = user ? isAuthorized(user.role, "manager") : false;
  const showPartnerStrip = user?.role === "owner";
  const isOwner = user?.role === "owner";

  // Always-real data: pending + missing reports
  const [pending, recentDocs, earliestDate] = await Promise.all([
    getPendingBusinessDays(),
    getBusinessDaysByDates(window7),
    getEarliestBusinessDate(),
  ]);
  const presentDates = new Set(recentDocs.map((d) => String(d.date)));
  const relevantDates = datesSinceFirstReport(window7, earliestDate, current);
  const missingCount = relevantDates.filter((d) => !presentDates.has(d)).length;

  // Financial data for manager+
  let revThisMonthSen = 0;
  let expThisMonthSen = 0;
  let revLastMonthSen = 0;
  let expLastMonthSen = 0;
  let cashInHandSen: number | null = null;
  let cashVarianceMtdSen = 0;
  let hasThisMonthData = false;

  type PartnerEntry = {
    id: string;
    name: string;
    balanceSen: number;
    allocatedSen: number;
    drawingsSen: number;
    injectionsSen: number;
  };
  let partnerEntries: PartnerEntry[] = [];
  let occResult: ReturnType<typeof occupancy> | null = null;

  if (showFinancials) {
    const [
      thisMonthDays,
      lastMonthDays,
      thisMonthRevEntries,
      lastMonthRevEntries,
      thisMonthExpenses,
      lastMonthExpenses,
      revCats,
      expCats,
    ] = await Promise.all([
      getBusinessDaysForMonth(currentMonth),
      getBusinessDaysForMonth(lastMonth),
      getRevenueEntriesForMonth(currentMonth),
      getRevenueEntriesForMonth(lastMonth),
      getExpensesForMonth(currentMonth),
      getExpensesForMonth(lastMonth),
      getAllCategories("revenue"),
      getAllCategories("expense"),
    ]);

    const allCategories = [...revCats, ...expCats];
    const categoryNameById = new Map(allCategories.map((c) => [c._id.toString(), c.name]));

    const nightDays = thisMonthDays.map((d) => toNightDayDoc(d as Record<string, unknown>));
    const lastNightDays = lastMonthDays.map((d) => toNightDayDoc(d as Record<string, unknown>));

    const standaloneRevenue = thisMonthRevEntries.map((e) =>
      toStandaloneEntry(e as unknown as Record<string, unknown>),
    );
    const standaloneExpenses = thisMonthExpenses.map((e) =>
      toStandaloneEntry(e as unknown as Record<string, unknown>),
    );
    const lastStandaloneRevenue = lastMonthRevEntries.map((e) =>
      toStandaloneEntry(e as unknown as Record<string, unknown>),
    );
    const lastStandaloneExpenses = lastMonthExpenses.map((e) =>
      toStandaloneEntry(e as unknown as Record<string, unknown>),
    );

    const revSummary = revenueBySource(nightDays, standaloneRevenue, categoryNameById);
    const expSummary = expensesByCategory(nightDays, standaloneExpenses, categoryNameById);
    const lastRevSummary = revenueBySource(lastNightDays, lastStandaloneRevenue, categoryNameById);
    const lastExpSummary = expensesByCategory(lastNightDays, lastStandaloneExpenses, categoryNameById);

    revThisMonthSen = revSummary.totalSen;
    expThisMonthSen = expSummary.totalSen;
    revLastMonthSen = lastRevSummary.totalSen;
    expLastMonthSen = lastExpSummary.totalSen;
    hasThisMonthData = thisMonthDays.length > 0 || thisMonthRevEntries.length > 0 || thisMonthExpenses.length > 0;

    // Cash in hand: latest night report's cash.countedSen
    if (nightDays.length > 0) {
      // sorted oldest-first by getBusinessDaysForMonth; take the last one
      const latestDay = nightDays[nightDays.length - 1];
      cashInHandSen = latestDay.cash.countedSen;
    }

    // Cash variance MTD: sum of all this month's varianceSen
    cashVarianceMtdSen = nightDays.reduce((s, d) => s + (d.varianceSen ?? 0), 0);

    // Occupancy: only if roomsAvailable is set
    if (settings.roomsAvailable != null) {
      occResult = occupancy(nightDays, settings.roomsAvailable);
    }

    // Partners (owner only)
    if (showPartnerStrip) {
      const [partners, balancesMap] = await Promise.all([listPartners(), getPartnerBalances()]);
      partnerEntries = partners.map((p) => {
        const bal = balancesMap.get(p._id.toString());
        return {
          id: p._id.toString(),
          name: p.name,
          balanceSen: bal?.balanceSen ?? 0,
          allocatedSen: bal?.allocatedSen ?? 0,
          drawingsSen: bal?.drawingsSen ?? 0,
          injectionsSen: bal?.injectionsSen ?? 0,
        };
      });
    }
  }

  const profitThisMonthSen = isOwner ? netProfitSen(revThisMonthSen, expThisMonthSen) : null;

  const varianceOverThreshold = Math.abs(cashVarianceMtdSen) > settings.varianceThresholdSen;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Dashboard
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Figures below show as soon as there&apos;s data to report — no
          placeholder numbers.
        </p>
      </div>

      {/* Top row — this month's financials */}
      {showFinancials ? (
        <div
          className={`grid min-w-0 grid-cols-1 gap-3 ${isOwner ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
        >
          {hasThisMonthData ? (
            <Stat
              label="Revenue (this month)"
              value={`RM ${fromSen(revThisMonthSen)}`}
              delta={deltaLabel(revThisMonthSen, revLastMonthSen)}
            />
          ) : (
            <Stat label="Revenue (this month)" unavailableMessage="No data yet" />
          )}
          {hasThisMonthData ? (
            <Stat
              label="Expenses (this month)"
              value={`RM ${fromSen(expThisMonthSen)}`}
              delta={deltaLabel(expThisMonthSen, expLastMonthSen)}
            />
          ) : (
            <Stat label="Expenses (this month)" unavailableMessage="No data yet" />
          )}
          {isOwner && profitThisMonthSen !== null ? (
            hasThisMonthData ? (
              <Stat
                label="Net profit (this month)"
                value={`${profitThisMonthSen < 0 ? "−" : ""}RM ${fromSen(Math.abs(profitThisMonthSen))}`}
              />
            ) : (
              <Stat label="Net profit (this month)" unavailableMessage="No data yet" />
            )
          ) : null}
        </div>
      ) : null}

      {/* Second row — approvals and missing reports (real data, keep exactly as-is) */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Days awaiting approval"
          value={String(pending.length)}
          href="/reception"
        />
        {earliestDate === null ? (
          <Stat
            label="Missing night reports"
            unavailableMessage="No reports yet"
            href="/reception"
          />
        ) : (
          <Stat
            label="Missing night reports"
            value={String(missingCount)}
            href="/reception"
          />
        )}
      </div>

      {/* Third row — cash */}
      {showFinancials ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {cashInHandSen !== null ? (
            <Stat
              label="Cash in hand (front desk)"
              value={`RM ${fromSen(cashInHandSen)}`}
            />
          ) : (
            <Stat label="Cash in hand (front desk)" unavailableMessage="No data yet" />
          )}
          {hasThisMonthData ? (
            <div
              className="flex min-w-0 flex-col gap-1 rounded-card border p-4"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
                Cash variance (month to date)
              </span>
              <span
                className="money break-all"
                style={{
                  fontSize: "var(--text-hero-money)",
                  fontWeight: 600,
                  color: varianceOverThreshold ? "var(--warn)" : undefined,
                }}
              >
                {cashVarianceMtdSen < 0 ? "−" : ""}RM {fromSen(Math.abs(cashVarianceMtdSen))}
              </span>
            </div>
          ) : (
            <Stat label="Cash variance (month to date)" unavailableMessage="No data yet" />
          )}
        </div>
      ) : null}

      {/* Occupancy row (manager+, only if roomsAvailable set) */}
      {showFinancials && occResult !== null && occResult.availableTotal > 0 ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Occupancy" value={`${Math.round(occResult.occupancyRatio * 100)}%`} />
          <Stat label="Rooms sold" value={String(occResult.soldTotal)} />
          <Stat label="ADR" value={`RM ${fromSen(occResult.adrSen)}`} />
          <Stat label="RevPAR" value={`RM ${fromSen(occResult.revparSen)}`} />
        </div>
      ) : null}

      {/* Fourth row — upcoming commitments */}
      {showFinancials ? (
        <div>
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Upcoming commitments
          </h2>
          <p style={{ color: "var(--text-faint)" }}>Nothing scheduled yet.</p>
        </div>
      ) : null}

      {/* Partner strip — owner only */}
      {showPartnerStrip ? (
        <div>
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Partners
          </h2>
          {partnerEntries.length === 0 ? (
            <p style={{ color: "var(--text-faint)" }}>No partner records yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {partnerEntries.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-card border p-4"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <h3
                    style={{ fontSize: "var(--text-label)", fontWeight: 600 }}
                  >
                    {p.name}
                  </h3>
                  <div
                    className="grid grid-cols-2 gap-1"
                    style={{ fontSize: "var(--text-caption)" }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>Allocated</span>
                    <span className="money">{formatRM(p.allocatedSen)}</span>
                    <span style={{ color: "var(--text-muted)" }}>Drawings</span>
                    <span className="money money-out">−{formatRM(p.drawingsSen)}</span>
                    <span style={{ color: "var(--text-muted)" }}>Balance</span>
                    <span
                      className={`money ${p.balanceSen < 0 ? "money-out" : ""}`}
                      style={{ fontWeight: 600 }}
                    >
                      {p.balanceSen < 0 ? "−" : ""}
                      {formatRM(Math.abs(p.balanceSen))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {settings.roomsAvailable == null ? (
        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          Occupancy, ADR and RevPAR will show here once a sellable room count is set.
        </p>
      ) : null}
    </div>
  );
}
