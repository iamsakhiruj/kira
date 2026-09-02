"use client";

import { useFirstLoadAnimation } from "./use-first-load-animation";

/**
 * A thin wrapper around the .card / .card-tint-* / .card-flat /
 * .card-interactive / .card-animate-in classes already built in
 * app/globals.css — this extracts an existing, proven treatment into a
 * component, not a new visual design.
 *
 * `flat` selects the reception-lighter surface (.card-flat) instead of the
 * full depth treatment; tint is ignored when flat, since flat surfaces
 * don't carry a tint wash today (see app/reception's line-item boxes and
 * the night-report summary rail). `animate` is gated on the shared
 * first-load-only hook — passing `animate` without ever having it be true
 * on a reception surface is how those stay motion-free by construction:
 * callers on reception screens should simply never pass `animate`.
 */
export default function Card({
  tone = "neutral",
  flat = false,
  interactive = false,
  animate = false,
  delayMs = 0,
  className = "",
  style,
  children,
}: {
  tone?: "neutral" | "revenue" | "expense" | "brand";
  flat?: boolean;
  interactive?: boolean;
  animate?: boolean;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const shouldAnimate = useFirstLoadAnimation() && animate;

  const classes = flat
    ? "card-flat"
    : `card card-tint-${tone}`;

  return (
    <div
      className={[
        classes,
        interactive ? "card-interactive" : "",
        shouldAnimate ? "card-animate-in" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={shouldAnimate ? { animationDelay: `${delayMs}ms`, ...style } : style}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
