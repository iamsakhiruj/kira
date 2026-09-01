"use client";

import { useState, type ReactNode } from "react";

/**
 * The only interactive piece of the shell — everything else in AppShell is
 * a server component. Desktop: sidebar is always visible. Mobile: hidden
 * behind a hamburger toggle, since reception is on a phone and the sidebar
 * would otherwise eat the whole screen before they reach the form.
 */
export default function SidebarToggle({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center justify-between border-b px-4 py-3 md:hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {header}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center rounded"
          style={{ height: "var(--touch-target)", width: "var(--touch-target)" }}
        >
          <span style={{ fontSize: "20px" }}>{open ? "✕" : "☰"}</span>
        </button>
      </div>
      <aside
        className={`${open ? "flex" : "hidden"} md:flex w-full flex-col border-r md:w-56 md:shrink-0`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="hidden border-b p-3 md:block" style={{ borderColor: "var(--border)" }}>
          {header}
        </div>
        {children}
      </aside>
    </>
  );
}
