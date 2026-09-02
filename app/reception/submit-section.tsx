"use client";

import { useState, type ReactNode } from "react";

/**
 * Owner/manager come to Front desk to approve, not to submit — so the night
 * report form sits below the approval queue, collapsed behind this toggle.
 * They can still submit when covering a shift; it just isn't in the way.
 * Collapsed = children not rendered at all (the form and its sticky footer
 * never mount until opened).
 */
export default function SubmitSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-11 self-start rounded-card border px-4"
        style={{ borderColor: "var(--border-strong)", color: "var(--brand)" }}
      >
        {open ? "Hide night report form" : "Submit a night report"}
      </button>
      {open ? children : null}
    </section>
  );
}
