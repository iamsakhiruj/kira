"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Preset = "this_month" | "last_month" | "this_year" | "custom";

/**
 * Date-range picker for /reports. Manages from/to inputs and preset buttons,
 * then pushes ?from=&to= onto the URL so the Server Component re-renders.
 * All date arithmetic uses the values the server already computed (passed as
 * initialFrom / initialTo) so the client never derives a business date itself.
 */
export default function ReportsPicker({
  initialFrom,
  initialTo,
  initialPreset,
}: {
  initialFrom: string;
  initialTo: string;
  initialPreset: Preset;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [preset, setPreset] = useState<Preset>(initialPreset);

  function applyPreset(p: Preset, newFrom: string, newTo: string) {
    setPreset(p);
    setFrom(newFrom);
    setTo(newTo);
    router.push(`/reports?from=${newFrom}&to=${newTo}`);
  }

  function handleFromChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setFrom(value);
    if (to >= value) {
      router.push(`/reports?from=${value}&to=${to}`);
    }
  }

  function handleToChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setTo(value);
    if (value >= from) {
      router.push(`/reports?from=${from}&to=${value}`);
    }
  }

  // Preset calculators — pure string arithmetic, no Date objects needed.
  function presetThisMonth(): [string, string] {
    const [y, m] = initialFrom.split("-");
    // Use the year/month from the server-provided "this month" start date.
    const lastDay = lastDayOfMonth(y, m);
    return [`${y}-${m}-01`, `${y}-${m}-${String(lastDay).padStart(2, "0")}`];
  }

  // These calculations need actual date math — use the current from/to
  // as anchors. We derive month/year from initialFrom which the server set.
  function presetLastMonth(): [string, string] {
    const [ys, ms] = initialFrom.split("-");
    const y = Number(ys);
    const m = Number(ms);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const last = lastDayOfMonth(String(prevY), String(prevM).padStart(2, "0"));
    return [
      `${prevY}-${String(prevM).padStart(2, "0")}-01`,
      `${prevY}-${String(prevM).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    ];
  }

  function presetThisYear(): [string, string] {
    const [ys] = initialFrom.split("-");
    // to = initialTo which is today (server-provided)
    return [`${ys}-01-01`, initialTo];
  }

  function lastDayOfMonth(yearStr: string, monthStr: string): number {
    const y = Number(yearStr);
    const m = Number(monthStr);
    return new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  }

  const PRESETS: { id: Preset; label: string; compute: () => [string, string] }[] = [
    { id: "this_month", label: "This month", compute: presetThisMonth },
    { id: "last_month", label: "Last month", compute: presetLastMonth },
    { id: "this_year", label: "This year", compute: presetThisYear },
    { id: "custom", label: "Custom", compute: () => [from, to] },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              if (p.id === "custom") {
                setPreset("custom");
              } else {
                const [f, t] = p.compute();
                applyPreset(p.id, f, t);
              }
            }}
            className="rounded border px-3"
            style={{
              height: "var(--touch-target)",
              fontSize: "var(--text-label)",
              borderColor: preset === p.id ? "var(--brand)" : "var(--border-strong)",
              color: preset === p.id ? "var(--brand)" : "var(--text-muted)",
              background: preset === p.id ? "var(--brand-tint)" : "var(--surface)",
              fontWeight: preset === p.id ? 600 : undefined,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* From / To date inputs */}
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex items-center gap-2"
          style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
        >
          From
          <input
            type="date"
            className="rounded border px-3"
            style={{
              height: "var(--touch-target)",
              borderColor: "var(--border-strong)",
              background: "var(--surface)",
              fontSize: "var(--text-label)",
            }}
            value={from}
            max={to}
            onChange={(e) => handleFromChange(e.target.value)}
          />
        </label>
        <label
          className="flex items-center gap-2"
          style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
        >
          To
          <input
            type="date"
            className="rounded border px-3"
            style={{
              height: "var(--touch-target)",
              borderColor: "var(--border-strong)",
              background: "var(--surface)",
              fontSize: "var(--text-label)",
            }}
            value={to}
            min={from}
            onChange={(e) => handleToChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
