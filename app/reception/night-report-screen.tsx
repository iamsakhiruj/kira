"use client";

import { useState } from "react";
import { formatRM } from "@/lib/money";
import { requiresVarianceReason } from "@/lib/nightReport";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import NightReportForm from "./night-report-form";
import CorrectionRequestForm from "./correction-request-form";

export interface DaySummary {
  status: string;
  roomsSold: number;
  roomsAvailable: number;
  totalRevenueSen: number;
  countedSen: number;
  varianceSen: number;
  varianceReason: string;
  revenueGapSen: number;
  revenueGapReason: string;
  /** MongoDB _id of the businessDays document, needed by the correction form. */
  businessDayId: string;
  /**
   * Whether the current user may raise a correction request against this day.
   * Server-computed: day is submitted/approved AND (role !== reception OR
   * submittedBy === current user). Never derived client-side.
   */
  canRequestCorrection: boolean;
}

export interface DaySlot {
  date: string;
  label: string;
  /** Today or yesterday — gets the short "Missing — tap to fill in" copy
   * instead of the full "No report for <label> — add it" prompt. Computed
   * server-side; the client never derives this from a date comparison. */
  isRecent: boolean;
  summary: DaySummary | null;
}

function SubmittedCard({
  slot,
  thresholdSen,
  gapThresholdSen,
}: {
  slot: DaySlot;
  thresholdSen: number;
  gapThresholdSen: number;
}) {
  const s = slot.summary!;
  const out = requiresVarianceReason(s.varianceSen, thresholdSen);
  const gapOut = requiresVarianceReason(s.revenueGapSen, gapThresholdSen);
  return (
    <Card flat className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span style={{ fontWeight: 600 }}>{slot.label}</span>
        <Badge tone={s.status === "approved" ? "neutral" : "warn"}>
          {s.status}
        </Badge>
      </div>
      <div className="flex flex-col gap-1" style={{ fontSize: "var(--text-label)" }}>
        <div className="flex justify-between">
          <span style={{ color: "var(--text-muted)" }}>Rooms sold</span>
          <span className="money">
            {s.roomsSold}/{s.roomsAvailable}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--text-muted)" }}>Total revenue</span>
          <span className="money">{formatRM(s.totalRevenueSen)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--text-muted)" }}>Cash counted</span>
          <span className="money">{formatRM(s.countedSen)}</span>
        </div>
        <div
          className="flex justify-between rounded px-1"
          style={out ? { color: "var(--warn)", background: "var(--warn-bg)" } : undefined}
        >
          <span style={{ color: out ? "var(--warn)" : "var(--text-muted)" }}>
            Variance
          </span>
          <span className="money">
            {s.varianceSen > 0 ? "+" : ""}
            {formatRM(s.varianceSen)}
          </span>
        </div>
        {s.varianceReason ? (
          <p style={{ color: "var(--text-faint)" }}>Reason: {s.varianceReason}</p>
        ) : null}
        <div
          className="flex justify-between rounded px-1"
          style={gapOut ? { color: "var(--warn)", background: "var(--warn-bg)" } : undefined}
        >
          <span style={{ color: gapOut ? "var(--warn)" : "var(--text-muted)" }}>
            Revenue gap
          </span>
          <span className="money">
            {s.revenueGapSen > 0 ? "+" : ""}
            {formatRM(s.revenueGapSen)}
          </span>
        </div>
        {s.revenueGapReason ? (
          <p style={{ color: "var(--text-faint)" }}>Reason: {s.revenueGapReason}</p>
        ) : null}
      </div>
      {s.canRequestCorrection ? (
        <CorrectionRequestForm
          businessDayId={s.businessDayId}
          date={slot.date}
        />
      ) : null}
    </Card>
  );
}

export default function NightReportScreen({
  slots,
  currentDate,
  minDate,
  maxDate,
  defaults,
  varianceThresholdSen,
  revenueGapThresholdSen,
  expenseCeilingSen,
  revenueCategoryNames,
  expenseCategoryNames,
  otaPlatforms,
  existingDates,
}: {
  slots: DaySlot[];
  currentDate: string;
  minDate: string | undefined;
  maxDate: string;
  defaults: { roomsAvailable: number | null; openingFloatSen: number | null };
  varianceThresholdSen: number;
  revenueGapThresholdSen: number;
  expenseCeilingSen: number;
  revenueCategoryNames: string[];
  expenseCategoryNames: string[];
  otaPlatforms: { id: string; name: string; guestPaysPlatform: boolean }[];
  /** Business dates that already have a report — the in-form date picker uses
   * these to warn instead of offering a blank form that would fail the unique
   * index on submit. */
  existingDates: string[];
}) {
  const firstMissing = slots.find((s) => s.summary === null)?.date ?? null;
  const [active, setActive] = useState<string | null>(firstMissing);

  return (
    // No max-width here (unlike before) — each branch below sets its own,
    // since the active-form branch now needs to be wider than the rest of
    // the list for its two-column step+rail layout, while everything else
    // (submitted cards, "tap to fill in" buttons) stays the original
    // readable, phone-first max-w-2xl, left-aligned with the rest of the
    // page (banner, approval queue, toggle) rather than floating centred.
    <div className="flex flex-col gap-4">
      {slots.map((slot) => {
        if (slot.summary) {
          return (
            <div key={slot.date} className="max-w-2xl">
              <SubmittedCard
                slot={slot}
                thresholdSen={varianceThresholdSen}
                gapThresholdSen={revenueGapThresholdSen}
              />
            </div>
          );
        }
        if (active === slot.date) {
          return (
            // Wider than the max-w-2xl slots around it — the form's own
            // two-column layout (step content + summary rail) needs the room.
            <div key={slot.date} className="flex w-full max-w-4xl flex-col gap-3">
              <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>
                {slot.label}
              </h1>
              <NightReportForm
                date={slot.date}
                currentDate={currentDate}
                minDate={minDate}
                maxDate={maxDate}
                defaults={defaults}
                varianceThresholdSen={varianceThresholdSen}
                revenueGapThresholdSen={revenueGapThresholdSen}
                expenseCeilingSen={expenseCeilingSen}
                revenueCategoryNames={revenueCategoryNames}
                expenseCategoryNames={expenseCategoryNames}
                otaPlatforms={otaPlatforms}
                existingDates={existingDates}
              />
            </div>
          );
        }
        return (
          <button
            key={slot.date}
            type="button"
            onClick={() => setActive(slot.date)}
            className="max-w-2xl rounded-card border p-4 text-left"
            style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}
          >
            {slot.isRecent ? (
              <>
                <div style={{ fontWeight: 600 }}>{slot.label}</div>
                <div style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}>
                  Missing — tap to fill in
                </div>
              </>
            ) : (
              <div style={{ fontWeight: 600, color: "var(--brand)" }}>
                No report for {slot.label} — add it
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
