import type { StoredCorrectionRequest } from "@/lib/correctionRequestsStore";

/**
 * Reception's own correction requests and their outcomes. Server-rendered
 * (no interaction needed here — raises happen on SubmittedCard). Shown only
 * when role === "reception" and there is at least one request; for manager/
 * owner the approval queue covers this.
 */
export default function MyCorrectionsSection({
  corrections,
}: {
  corrections: StoredCorrectionRequest[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 style={{ fontSize: "var(--text-section)", fontWeight: 600 }}>
        My correction requests
      </h2>
      <div className="flex flex-col gap-3">
        {corrections.map((c) => {
          const status = c.status;
          const badgeColor =
            status === "open"
              ? "var(--warn)"
              : status === "applied"
                ? "var(--money-in)"
                : "var(--text-muted)";
          const badgeBg =
            status === "open"
              ? "var(--warn-bg)"
              : status === "applied"
                ? "var(--money-in-bg)"
                : "var(--surface)";
          return (
            <div
              key={String(c._id)}
              className="rounded-card border p-4 flex flex-col gap-2"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                fontSize: "var(--text-label)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontWeight: 600 }}>{c.businessDate}</span>
                <span
                  className="rounded px-2 py-0.5"
                  style={{
                    fontSize: "var(--text-caption)",
                    color: badgeColor,
                    background: badgeBg,
                    border: `1px solid ${badgeColor}`,
                  }}
                >
                  {status}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <p style={{ color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600 }}>What needs correcting:</span>{" "}
                  {c.whatNeedsCorrecting}
                </p>
                <p style={{ color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600 }}>What it should be:</span>{" "}
                  {c.whatItShouldBe}
                </p>
              </div>
              {c.resolutionNote ? (
                <p
                  style={{
                    color: "var(--text-faint)",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "8px",
                    marginTop: "4px",
                  }}
                >
                  Resolution note: {c.resolutionNote}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
