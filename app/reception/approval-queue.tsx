import Link from "next/link";
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
import { getOpenCorrectionRequests } from "@/lib/correctionRequestsStore";
import Badge from "@/components/ui/badge";
import Card from "@/components/ui/card";
import DataTable from "@/components/ui/data-table";
import ApproveButton from "./approve-button";
import ResolveCorrectionButton from "./resolve-correction-button";

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
    return <td className="px-4 py-3" style={{ color: "var(--text-faint)" }}>—</td>;
  }
  const hours = submissionLatenessHours(date, submittedAt, cutoffHour);
  const late = isLateSubmission(date, submittedAt, thresholdHours, cutoffHour);
  return (
    <td
      className="px-4 py-3"
      style={{ color: late ? "var(--warn)" : "var(--text-muted)" }}
    >
      {formatLateness(hours)}
    </td>
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
  const [pending, approved, openCorrections] = await Promise.all([
    getPendingBusinessDays(),
    getRecentlyApprovedBusinessDays(RECENT_APPROVED_LIMIT),
    getOpenCorrectionRequests(),
  ]);

  const userIds = new Set<string>();
  for (const d of pending) if (d.submittedBy) userIds.add(String(d.submittedBy));
  for (const d of approved) {
    if (d.submittedBy) userIds.add(String(d.submittedBy));
    if (d.approvedBy) userIds.add(String(d.approvedBy));
  }
  for (const c of openCorrections) {
    if (c.requestedBy) userIds.add(String(c.requestedBy));
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
        <DataTable
          animate
          columns={[
            { key: "date", header: "Date" },
            { key: "submittedBy", header: "Submitted by" },
            { key: "submitted", header: "Submitted" },
            { key: "revenue", header: "Revenue", align: "right" },
            { key: "variance", header: "Variance", align: "right" },
            { key: "gap", header: "Revenue gap", align: "right" },
            { key: "actions", header: "" },
          ]}
          isEmpty={pending.length === 0}
          emptyMessage="Nothing waiting on you."
        >
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
                className="table-row-hover"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-4 py-3">
                  {String(d.date)}
                  {d.enteredLate ? (
                    <Badge tone="warn" className="ml-2">Backdated</Badge>
                  ) : null}
                  {d.editedBy ? (
                    <Badge tone="warn" className="ml-2">Edited</Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3">{nameOf(d.submittedBy)}</td>
                <SubmittedCell
                  date={String(d.date)}
                  submittedAt={submittedAtOf(d)}
                  cutoffHour={settings.cutoffHour}
                  thresholdHours={settings.lateSubmissionThresholdHours}
                />
                <td className="px-4 py-3 money text-right">{formatRM(revenue)}</td>
                <td
                  className="px-4 py-3 money text-right"
                  style={varOut ? { color: "var(--warn)" } : undefined}
                >
                  {formatRM(varianceSen)}
                </td>
                <td
                  className="px-4 py-3 money text-right"
                  style={gapOut ? { color: "var(--warn)" } : undefined}
                >
                  {formatRM(gapSen)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {/* Owner/manager may fix a mistake before approving —
                        only while submitted; approved days lock. */}
                    <Link
                      href={`/reception/edit/${String(d._id)}`}
                      style={{ color: "var(--brand)", fontSize: "var(--text-label)" }}
                    >
                      Edit
                    </Link>
                    <ApproveButton businessDayId={String(d._id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Open correction requests
          {openCorrections.length ? ` (${openCorrections.length})` : ""}
        </h2>
        {openCorrections.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No open correction requests.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {openCorrections.map((c, i) => (
              <Card
                key={String(c._id)}
                tone="neutral"
                animate
                delayMs={i * 40}
                className="flex flex-col gap-3 p-4"
                style={{ fontSize: "var(--text-label)" }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <span style={{ fontWeight: 600 }}>{String(c.businessDate)}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      Requested by {nameOf(c.requestedBy)}
                    </span>
                  </div>
                  <Badge tone="warn">open</Badge>
                </div>
                <div className="flex flex-col gap-1">
                  <p>
                    <span style={{ color: "var(--text-muted)" }}>
                      What needs correcting:
                    </span>{" "}
                    {String(c.whatNeedsCorrecting)}
                  </p>
                  <p>
                    <span style={{ color: "var(--text-muted)" }}>
                      What it should be:
                    </span>{" "}
                    {String(c.whatItShouldBe)}
                  </p>
                  <p>
                    <span style={{ color: "var(--text-muted)" }}>Reason:</span>{" "}
                    {String(c.reason)}
                  </p>
                </div>
                <ResolveCorrectionButton correctionId={String(c._id)} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
          Recently approved
        </h2>
        <DataTable
          animate
          columns={[
            { key: "date", header: "Date" },
            { key: "submittedBy", header: "Submitted by" },
            { key: "submitted", header: "Submitted" },
            { key: "approvedBy", header: "Approved by" },
            { key: "flags", header: "" },
          ]}
          isEmpty={approved.length === 0}
          emptyMessage="Nothing approved yet."
        >
          {approved.map((d: WithId<Document>) => {
            const submittedBy = d.submittedBy ? String(d.submittedBy) : "";
            const approvedBy = d.approvedBy ? String(d.approvedBy) : null;
            const self = isSelfApproved(submittedBy, approvedBy);
            return (
              <tr
                key={String(d._id)}
                className="table-row-hover"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-4 py-3">
                  {String(d.date)}
                  {d.enteredLate ? (
                    <Badge tone="warn" className="ml-2">Backdated</Badge>
                  ) : null}
                  {d.editedBy ? (
                    <Badge tone="warn" className="ml-2">Edited</Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3">{nameOf(d.submittedBy)}</td>
                <SubmittedCell
                  date={String(d.date)}
                  submittedAt={submittedAtOf(d)}
                  cutoffHour={settings.cutoffHour}
                  thresholdHours={settings.lateSubmissionThresholdHours}
                />
                <td className="px-4 py-3">{nameOf(d.approvedBy)}</td>
                <td className="px-4 py-3">
                  {self ? <Badge tone="warn">Self-approved</Badge> : null}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>
    </div>
  );
}
