"use client";

import Link from "next/link";
import Counter from "@/components/animated/counter";
import Card from "./card";

/**
 * Extracted from app/dashboard/page.tsx's original local `Stat` function —
 * same props, same behavior, now wrapping the shared `Card` instead of
 * hand-rolling its classes, and gated on the shared first-load-only hook
 * (via Card's own `animate` prop) instead of always animating.
 */
export default function StatTile({
  label,
  value,
  variant = "money",
  unavailableMessage,
  href,
  delta,
  tone = "neutral",
  warn = false,
  flat = false,
  animate = false,
  delayMs = 0,
}: {
  label: string;
  value?: number;
  variant?: "money" | "int" | "percent";
  unavailableMessage?: string;
  href?: string;
  delta?: string;
  tone?: "neutral" | "revenue" | "expense" | "brand";
  warn?: boolean;
  flat?: boolean;
  animate?: boolean;
  delayMs?: number;
}) {
  const body = (
    <Card
      tone={tone}
      flat={flat}
      interactive={!!href}
      animate={animate}
      delayMs={delayMs}
      className="flex min-w-0 flex-col gap-1 p-4"
    >
      <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
        {label}
      </span>
      {unavailableMessage ? (
        <span style={{ fontSize: "var(--text-body)", color: "var(--text-faint)" }}>
          {unavailableMessage}
        </span>
      ) : (
        <span
          className="money break-all"
          style={{
            fontSize: "var(--text-hero-money)",
            fontWeight: 600,
            color: warn ? "var(--warn)" : undefined,
          }}
        >
          {value !== undefined ? (
            <Counter
              value={value}
              variant={variant}
              prefix={variant === "money" ? "RM " : ""}
              suffix={variant === "percent" ? "%" : ""}
            />
          ) : null}
        </span>
      )}
      {delta ? (
        <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
          {delta}
        </span>
      ) : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block min-w-0">
      {body}
    </Link>
  ) : (
    <div className="min-w-0">{body}</div>
  );
}
