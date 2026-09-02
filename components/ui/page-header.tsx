"use client";

import { useFirstLoadAnimation } from "./use-first-load-animation";

export default function PageHeader({
  title,
  description,
  action,
  animate = false,
  delayMs = 0,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  animate?: boolean;
  delayMs?: number;
}) {
  const shouldAnimate = useFirstLoadAnimation() && animate;

  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 ${shouldAnimate ? "card-animate-in" : ""}`}
      style={shouldAnimate ? { animationDelay: `${delayMs}ms` } : undefined}
      suppressHydrationWarning
    >
      <div>
        <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 600 }}>{title}</h1>
        {description ? (
          <p style={{ color: "var(--text-muted)" }}>{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
