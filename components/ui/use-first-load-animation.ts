"use client";

import { useState } from "react";

const ANIMATE_FLAG = "hbkl:first-load-animated";

/**
 * True exactly once per browser session — the first time anything using it
 * mounts after a fresh session, not on every client-side navigation. Shared
 * by the sidebar nav (components/nav-list.tsx) and every animated
 * components/ui/ primitive (Card, PageHeader, FormPanel, DataTable,
 * StatTile) via one sessionStorage flag, so the whole shell and the page
 * content fade in together exactly once, not independently — otherwise a
 * page that mounts a beat after the sidebar could replay its own "first
 * load" after the sidebar's had already fired.
 *
 * Each protected route has its own layout.tsx calling AppShell fresh, so
 * these components genuinely remount on every route change — sessionStorage,
 * not React state, is what makes "once" mean once.
 *
 * The lazy initializer runs during render, both for the server pass
 * (window is undefined there, so it's always false — a safe, non-animated
 * default) and for the client's first hydrating render (where it can
 * legitimately differ on a true first load). That one intentional
 * server/client difference is why animated elements using this hook should
 * carry suppressHydrationWarning.
 */
export function useFirstLoadAnimation(): boolean {
  const [animate] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem(ANIMATE_FLAG)) return false;
      sessionStorage.setItem(ANIMATE_FLAG, "1");
      return true;
    } catch {
      return false;
    }
  });
  return animate;
}
