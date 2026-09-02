import type { Document, WithId } from "mongodb";
import {
  getPendingBusinessDays,
  getRecentlyApprovedBusinessDays,
} from "@/lib/businessDays";
import { getUserNamesByIds } from "@/lib/users";
import { getSettings } from "@/lib/settings";
import { formatRM } from "@/lib/money";
import {
  submissionLatenessHours,
  isLateSubmission,
} from "@/lib/businessDate";
import {
  totalRevenueSen,
  requiresVarianceReason,
  isSelfApproved,
} from "@/lib/nightReport";
import ApproveButton from "./approve-button";

const RECENT_APPROVED_LIMIT = 20;

/** A night report's submittedAt as a Date, or null if absent. */
function submittedAtOf(doc: WithId<Document>): Date | null {
  const v = doc.submittedAt;
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** How long after the business date ended the report was filed, e.g.
 * "on time", "8h after", "1d 4h after". */
function formatLateness(hours: number): string {
  if (hours <= 0.5) return "on time";
  const h = Math.round(hours);
  if (h < 24) return `${h}h after`;
  const days = Math.floor(h / 24);
  const rem = h % 24;
  return rem ? `${days}d ${rem}h after` : `${days}d after`;
}

/**
 * The submission-timing cell: how long after the business date ended the
 * report was actually filed. A report for 2 Sep submitted at 03:00 on 3 Sep is
 * "on time"; the same report at 14:00 shows the gap, amber once it's past the
 * late-submission threshold. Purely informational — nothing here blocked it.
 */
function SubmittedCell({
  date,
  submittedAt,
  cutoffHour,
  thresholdHours,
}: {
  date: string;
  submittedAt: Date | null;
  cutoffHour: number;
  thresholdHours: number;
}) {
  if (!submittedAt) {
    return <td className="p-2" style={{ color: "var(--text-faint)" }}>—</td>;
  }
  const hours = submissionLatenessHours(date, submittedAt, cutoffHour);
  const late = isLateSubmission(date, submittedAt, thresholdHours, cutoffHour);
  return (
    <td
      className="p-2"
      style={{ color: late ? "var(--warn)" : "var(--text-muted)" }}
    >
      {formatLateness(hours)}
    </td>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="ml-2 rounded px-2 py-0.5"
      style={{
        fontSize: "var(--text-caption)",
        color: "var(--warn)",
        background: "var(--warn-bg)",
      }}
    >
      {children}
    </span>
  );
}

/**
 * The manager/owner review queue — self-contained so `app/reception/page.tsx`
 * can render it conditionally with no extra data-threading. Moved here (was
 * `app/owner/page.tsx`) so it lives on the same URL reception uses, per
 * Phase 2 §5's sidebar: there's no separate "approvals" nav item, Front desk
 * covers night reports broadly. Visible to manager and owner; reception
 * never reaches this component (the page itself gates it).
 */
export default async function ApprovalQueue() {
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
                  <th className="p-2 text-left">Submitted</th>
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
                      <td className="p-2">
                        {String(d.date)}
                        {d.enteredLate ? <Badge>Backdated</Badge> : null}
                      </td>
                      <td className="p-2">{nameOf(d.submittedBy)}</td>
                      <SubmittedCell
                        date={String(d.date)}
                        submittedAt={submittedAtOf(d)}
                        cutoffHour={settings.cutoffHour}
                        thresholdHours={settings.lateSubmissionThresholdHours}
                      />
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
                  <th className="p-2 text-left">Submitted</th>
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
                      <td className="p-2">
                        {String(d.date)}
                        {d.enteredLate ? <Badge>Backdated</Badge> : null}
                      </td>
                      <td className="p-2">{nameOf(d.submittedBy)}</td>
                      <SubmittedCell
                        date={String(d.date)}
                        submittedAt={submittedAtOf(d)}
                        cutoffHour={settings.cutoffHour}
                        thresholdHours={settings.lateSubmissionThresholdHours}
                      />
                      <td className="p-2">{nameOf(d.approvedBy)}</td>
                      <td className="p-2">
                        {self ? <Badge>Self-approved</Badge> : null}
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
