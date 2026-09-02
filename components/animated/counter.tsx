"use client";

import { useEffect, useRef, useState } from "react";
import { fromSen } from "@/lib/money";

type Variant = "money" | "int" | "percent";

function formatValue(v: number, variant: Variant, prefix: string, suffix: string): string {
  const rounded = Math.round(v);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  if (variant === "money") {
    return `${negative ? "−" : ""}${prefix}${fromSen(abs)}${suffix}`;
  }
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${prefix}${grouped}${suffix}`;
}

/**
 * Counts up from zero to `value` once on mount, then holds. Renders the
 * final value on the server (and as the initial client state) so there is
 * no hydration mismatch — the count-up is a purely client-side flourish
 * layered on top of an already-correct number. Skips the animation
 * entirely under prefers-reduced-motion.
 */
export default function Counter({
  value,
  variant = "int",
  prefix = "",
  suffix = "",
  durationMs = 700,
}: {
  value: number;
  variant?: Variant;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf: number;

    function tick(now: number, start: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        setDisplay(value * eased);
        raf = requestAnimationFrame((n) => tick(n, start));
      } else {
        setDisplay(value);
      }
    }

    // Defer the reset-to-zero into the first animation frame rather than
    // setting state synchronously in the effect body.
    raf = requestAnimationFrame((firstNow) => {
      setDisplay(0);
      raf = requestAnimationFrame((n) => tick(n, firstNow));
    });
    return () => cancelAnimationFrame(raf);
    // Animate once, from the value present at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{formatValue(display, variant, prefix, suffix)}</>;
}
