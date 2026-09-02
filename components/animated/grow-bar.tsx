"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * A chart bar that grows from zero to `pct` once on mount, via a CSS
 * transition (not a keyframe animation), so prefers-reduced-motion — which
 * zeroes transition-duration globally (see app/globals.css) — collapses it
 * to an instant jump for free.
 */
export default function GrowBar({
  pct,
  className,
  style,
}: {
  pct: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <div
      className={className}
      style={{
        width: `${width}%`,
        transition: "width 650ms cubic-bezier(0.16, 1, 0.3, 1)",
        ...style,
      }}
    />
  );
}
