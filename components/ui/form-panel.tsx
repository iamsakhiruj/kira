"use client";

import Card from "./card";

/**
 * Replaces the `rounded-card border p-4` + copy-pasted `fieldStyle` wrapper
 * that was identical across revenue/expenses/employees/salary/partners/OTA
 * and all four settings managers. Owns the panel chrome, optional title,
 * and error slot; field layout stays with the caller (a 3-col grid,
 * Employees' extra owner-only section, etc.) since that genuinely differs
 * per form and forcing one layout would fight real differences.
 */
export default function FormPanel({
  title,
  error,
  flat = false,
  animate = false,
  delayMs = 0,
  className = "",
  children,
}: {
  title?: string;
  error?: string | null;
  flat?: boolean;
  animate?: boolean;
  delayMs?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      flat={flat}
      animate={animate}
      delayMs={delayMs}
      className={`flex flex-col gap-3 p-4 ${className}`}
    >
      {title ? (
        <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>{title}</h2>
      ) : null}
      {children}
      {error ? (
        <p style={{ fontSize: "var(--text-label)", color: "var(--warn)" }}>{error}</p>
      ) : null}
    </Card>
  );
}
