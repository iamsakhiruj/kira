import type { Document, WithId } from "mongodb";
import {
  getPendingBusinessDays,
  getRecentlyApprovedBusinessDays,
} from "@/lib/businessDays";
import { getUserNamesByIds } from "@/lib/users";
import { getSettings } from "@/lib/settings";
import { formatRM } from "@/lib/money";
import {
  totalRevenueSen,
  requiresVarianceReason,
  isSelfApproved,
} from "@/lib/nightReport";
import ApproveButton from "./approve-button";

// Depends on request-time data (the review queue); never prerender.
export const dynamic = "force-dynamic";

const RECENT_APPROVED_LIMIT = 20;

export default async function OwnerHome() {
  const settings = await getSettings();
  const [pending, approved] = await Promise.all([
    getPendingBusinessDays(),
    getRecentlyApprovedBusinessDays(RECENT_APPROVED_LIMIT),
  ]);

  const userIds = new Set<string>();
  for (const d of pending) if (d.submittedBy) userIds.add(String(d.submittedBy));
  for (const d of approved) {
    if (d.submittedBy) userIds.add(String(d.submittedBy));
    if (d.approvedBy) userIds.add(String(d.approvedBy));
  }
  const names = await getUserNamesByIds([...userIds]);
  const nameOf = (id: unknown) =>
    id ? (names.get(String(id)) ?? "Unknown") : "—";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
          Owner console
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Daily review. Full reports and settings come in later steps.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Pending approval{pending.length ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Nothing waiting on you.</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ fontSize: "var(--text-label)" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Submitted by</th>
                  <th className="p-2 text-right">Revenue</th>
                  <th className="p-2 text-right">Variance</th>
                  <th className="p-2 text-right">Revenue gap</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {pending.map((d: WithId<Document>) => {
                  const revenue = totalRevenueSen(
                    d.rooms?.revenueSen ?? 0,
                    d.revenueLines ?? [],
                  );
                  const varianceSen = d.cash?.varianceSen ?? 0;
                  const gapSen = d.revenueGapSen ?? 0;
                  const varOut = requiresVarianceReason(
                    varianceSen,
                    settings.varianceThresholdSen,
                  );
                  const gapOut = requiresVarianceReason(
                    gapSen,
                    settings.revenueGapThresholdSen,
                  );
                  return (
                    <tr
                      key={String(d._id)}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="p-2">{String(d.date)}</td>
                      <td className="p-2">{nameOf(d.submittedBy)}</td>
                      <td className="p-2 money">{formatRM(revenue)}</td>
                      <td
                        className="p-2 money"
                        style={varOut ? { color: "var(--warn)" } : undefined}
                      >
                        {formatRM(varianceSen)}
                      </td>
                      <td
                        className="p-2 money"
                        style={gapOut ? { color: "var(--warn)" } : undefined}
                      >
                        {formatRM(gapSen)}
                      </td>
                      <td className="p-2 text-right">
                        <ApproveButton businessDayId={String(d._id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Recently approved
        </h2>
        {approved.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Nothing approved yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ fontSize: "var(--text-label)" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Submitted by</th>
                  <th className="p-2 text-left">Approved by</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {approved.map((d: WithId<Document>) => {
                  const submittedBy = d.submittedBy ? String(d.submittedBy) : "";
                  const approvedBy = d.approvedBy ? String(d.approvedBy) : null;
                  const self = isSelfApproved(submittedBy, approvedBy);
                  return (
                    <tr
                      key={String(d._id)}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="p-2">{String(d.date)}</td>
                      <td className="p-2">{nameOf(d.submittedBy)}</td>
                      <td className="p-2">{nameOf(d.approvedBy)}</td>
                      <td className="p-2">
                        {self ? (
                          <span
                            className="rounded px-2 py-0.5"
                            style={{
                              fontSize: "var(--text-caption)",
                              color: "var(--warn)",
                              background: "var(--warn-bg)",
                            }}
                          >
                            Self-approved
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
