import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isAuthorized } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { businessDateFor, lastBusinessDates } from "@/lib/businessDate";
import { getBusinessDaysByDates, getPendingBusinessDays } from "@/lib/businessDays";

// Depends on request-time data (approvals, missing days); never prerender.
export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 7;

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <div
      className="flex flex-col gap-1 rounded-card border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="money" style={{ fontSize: "var(--text-hero-money)", fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const current = businessDateFor(new Date(), settings.cutoffHour);
  const dates = lastBusinessDates(current, LOOKBACK_DAYS);

  const [pending, recentDocs] = await Promise.all([
    getPendingBusinessDays(),
    getBusinessDaysByDates(dates),
  ]);
  const presentDates = new Set(recentDocs.map((d) => String(d.date)));
  const missingCount = dates.filter((d) => !presentDates.has(d)).length;

  const showFinancials = user ? isAuthorized(user.role, "manager") : false;
  const showPartnerStrip = user?.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Dashboard
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Revenue, expenses and cash figures arrive with Phase 2 §7/old §6 steps
          2.3 onward — shown as &ldquo;—&rdquo; until then, not a guess.
        </p>
      </div>

      {/* Top row — this month's numbers */}
      {showFinancials ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Revenue (this month)" value="—" />
          <Stat label="Expenses (this month)" value="—" />
          <Stat label="Net profit (this month)" value="—" />
        </div>
      ) : null}

      {/* Second row — approvals and missing reports (real data) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Days awaiting approval"
          value={String(pending.length)}
          href="/reception"
        />
        <Stat
          label={`Missing night reports (last ${LOOKBACK_DAYS} days)`}
          value={String(missingCount)}
          href="/reception"
        />
      </div>

      {/* Third row — cash */}
      {showFinancials ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Cash in hand (front desk)" value="—" />
          <Stat label="Cash variance (month to date)" value="—" />
        </div>
      ) : null}

      {/* Fourth row — upcoming commitments */}
      {showFinancials ? (
        <div>
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Upcoming commitments
          </h2>
          <p style={{ color: "var(--text-muted)" }}>
            Nothing scheduled yet — salary runs and statutory deadlines arrive
            with steps 2.5 and 2.9.
          </p>
        </div>
      ) : null}

      {/* Partner strip — owner only */}
      {showPartnerStrip ? (
        <div>
          <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
            Partners
          </h2>
          <p style={{ color: "var(--text-muted)" }}>
            No partner records yet — arrives with step 2.6.
          </p>
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
