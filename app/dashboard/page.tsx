import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor, lastBusinessDates, datesSinceFirstReport } from "@/lib/businessDate";
import {
  getBusinessDaysByDates,
  getPendingBusinessDays,
  getEarliestBusinessDate,
} from "@/lib/businessDays";

// Depends on request-time data (approvals, missing days); never prerender.
export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 7;

function Stat({
  label,
  value,
  unavailableMessage,
  href,
}: {
  label: string;
  value?: string;
  unavailableMessage?: string;
  href?: string;
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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  const window7 = lastBusinessDates(current, LOOKBACK_DAYS);

  const [pending, recentDocs, earliestDate] = await Promise.all([
    getPendingBusinessDays(),
    getBusinessDaysByDates(window7),
    getEarliestBusinessDate(),
  ]);
  const presentDates = new Set(recentDocs.map((d) => String(d.date)));
  const relevantDates = datesSinceFirstReport(window7, earliestDate, current);
  const missingCount = relevantDates.filter((d) => !presentDates.has(d)).length;

  const showFinancials = user ? isAuthorized(user.role, "manager") : false;
  const showPartnerStrip = user?.role === "owner";

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

      {/* Top row — this month's numbers */}
      {showFinancials ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Revenue (this month)" unavailableMessage="No data yet" />
          <Stat label="Expenses (this month)" unavailableMessage="No data yet" />
          <Stat label="Net profit (this month)" unavailableMessage="No data yet" />
        </div>
      ) : null}

      {/* Second row — approvals and missing reports (real data) */}
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
          <Stat label="Cash in hand (front desk)" unavailableMessage="No data yet" />
          <Stat label="Cash variance (month to date)" unavailableMessage="No data yet" />
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
          <p style={{ color: "var(--text-faint)" }}>No partner records yet.</p>
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
