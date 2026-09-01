"use client";

import { useState } from "react";
import { formatRM } from "@/lib/money";
import { requiresVarianceReason } from "@/lib/nightReport";
import NightReportForm from "./night-report-form";

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
    <div
      className="rounded-card border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span style={{ fontWeight: 600 }}>{slot.label}</span>
        <span
          className="rounded px-2 py-0.5"
          style={{
            fontSize: "var(--text-caption)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-strong)",
          }}
        >
          {s.status}
        </span>
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
    </div>
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
}: {
  slots: DaySlot[];
  currentDate: string;
  minDate: string | undefined;
  maxDate: string;
  defaults: { roomsAvailable: number | null; openingFloatSen: number | null };
  varianceThresholdSen: number;
  revenueGapThresholdSen: number;
  expenseCeilingSen: number;
}) {
  const firstMissing = slots.find((s) => s.summary === null)?.date ?? null;
  const [active, setActive] = useState<string | null>(firstMissing);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {slots.map((slot) => {
        if (slot.summary) {
          return (
            <SubmittedCard
              key={slot.date}
              slot={slot}
              thresholdSen={varianceThresholdSen}
              gapThresholdSen={revenueGapThresholdSen}
            />
          );
        }
        if (active === slot.date) {
          return (
            <div key={slot.date} className="flex flex-col gap-3">
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
              />
            </div>
          );
        }
        return (
          <button
            key={slot.date}
            type="button"
            onClick={() => setActive(slot.date)}
            className="rounded-card border p-4 text-left"
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
