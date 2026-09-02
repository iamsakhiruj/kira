/**
 * Shared status pill — replaces three near-duplicate local implementations
 * (salary's `Badge`, the reception approval-queue's `Badge` + inline "open"
 * pill, partners' inline `s.140B` tag), each doing the same job slightly
 * differently.
 *
 * No hue is invented: CLAUDE.md reserves orange for interaction, green/red
 * for money direction only (via .money-in/.money-out), and amber for
 * "needs a human's attention." That leaves four tones, not five:
 *   - muted   — draft, inactive, resigned: "not current."
 *   - neutral — active, approved, paid: the normal/current state, no hue.
 *   - warn    — submitted (awaiting review), backdated, self-approved,
 *               edited: amber, same as every other "flag this" use already
 *               in the app.
 *   - brand   — the existing Director/Adjustment-style attribute tag
 *               (salary's current Badge already does this) — a labelled
 *               attribute, not a button, but the one shipped precedent for
 *               orange outside strict interaction.
 * Callers decide which tone a given status maps to; this component doesn't
 * know about "salary" or "businessDays" — it's just tone + text.
 *
 * `variant` covers the two pill styles already in use, exactly as shipped:
 *   - "outline" — border + coloured text, no fill (salary's current look).
 *   - "solid"   — a tinted background + coloured text, no border (the
 *                 approval queue's current look — "solid" as in "filled,"
 *                 not a saturated fill with white text).
 */

export type BadgeTone = "neutral" | "muted" | "warn" | "brand";
export type BadgeVariant = "outline" | "solid";

const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: "var(--text)",
  muted: "var(--text-faint)",
  warn: "var(--warn)",
  brand: "var(--brand)",
};

const TONE_BG: Record<BadgeTone, string> = {
  neutral: "var(--page)",
  muted: "var(--page)",
  warn: "var(--warn-bg)",
  brand: "var(--brand-tint)",
};

export default function Badge({
  tone = "neutral",
  variant = "outline",
  children,
  className,
}: {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 ${className ?? ""}`}
      style={{
        fontSize: "var(--text-caption)",
        fontWeight: 600,
        color,
        background: variant === "solid" ? TONE_BG[tone] : "transparent",
        border: variant === "outline" ? `1px solid ${color}` : "none",
      }}
    >
      {children}
    </span>
  );
}
