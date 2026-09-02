"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveCorrection } from "./correction-actions";

/**
 * Apply / Reject controls for a single open correction request.
 * Mirrors the approve-button.tsx pattern: client component, server action,
 * router.refresh() on success. Note is optional for apply, required for reject.
 */
export default function ResolveCorrectionButton({
  correctionId,
}: {
  correctionId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"applied" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(resolution: "applied" | "rejected") {
    setError(null);
    setPending(resolution);
    try {
      const res = await resolveCorrection(correctionId, resolution, note);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
        setPending(null);
      }
    } catch {
      setError("Couldn't resolve — check your connection and try again.");
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Resolution note (required for reject)"
        className="rounded border p-2"
        style={{
          fontSize: "var(--text-caption)",
          borderColor: "var(--border-strong)",
          background: "var(--page)",
          color: "var(--text)",
          resize: "vertical",
          minWidth: "180px",
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => handle("applied")}
          className="h-9 rounded-card px-3 font-medium"
          style={{
            background: "var(--brand)",
            color: "var(--on-brand)",
            opacity: busy ? 0.7 : 1,
            fontSize: "var(--text-label)",
          }}
        >
          {pending === "applied" ? "Applying…" : "Apply"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => handle("rejected")}
          className="h-9 rounded-card border px-3"
          style={{
            borderColor: "var(--border-strong)",
            color: "var(--text-muted)",
            background: "none",
            opacity: busy ? 0.7 : 1,
            fontSize: "var(--text-label)",
          }}
        >
          {pending === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
