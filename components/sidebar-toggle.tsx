"use client";

import { useState, type ReactNode } from "react";

/**
 * The only interactive piece of the shell — everything else in AppShell is
 * a server component. Desktop: the sidebar floats as a rounded card, sticky
 * within a margin so the page's own background gradient shows behind it.
 * Mobile: hidden behind a hamburger toggle, since reception is on a phone
 * and the sidebar would otherwise eat the whole screen before they reach
 * the form — opening it reveals the same floating-card treatment inline.
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
        className="flex items-center justify-between px-4 py-3 md:hidden"
        style={{ background: "var(--page)" }}
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
        className={`sidebar-panel ${open ? "flex" : "hidden"} relative z-40 m-4 min-w-0 flex-col overflow-hidden md:sticky md:top-4 md:flex md:h-[calc(100vh-2rem)] md:w-56 md:shrink-0`}
      >
        <div
          className="hidden items-center border-b p-3 md:flex"
          style={{ borderColor: "rgba(23, 36, 44, 0.07)" }}
        >
          {header}
        </div>
        {children}
      </aside>
    </>
  );
}
