"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { raiseCorrection } from "./correction-actions";

/**
 * A small inline form that lets reception (or manager/owner) raise a
 * correction request against a submitted/approved night report. Shown below
 * the SubmittedCard when canRequestCorrection is true (server-computed).
 */
export default function CorrectionRequestForm({
  businessDayId,
  date,
}: {
  businessDayId: string;
  date: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [whatNeedsCorrecting, setWhatNeedsCorrecting] = useState("");
  const [whatItShouldBe, setWhatItShouldBe] = useState("");
  const [reason, setReason] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await raiseCorrection({
        businessDayId,
        whatNeedsCorrecting,
        whatItShouldBe,
        reason,
      });
      if (res.ok) {
        setDone(true);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't send — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p
        className="mt-2"
        style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
      >
        Correction request sent for {date}.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-left"
        style={{
          fontSize: "var(--text-label)",
          color: "var(--brand)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        Request a correction
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-card border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <p style={{ fontWeight: 600, fontSize: "var(--text-label)" }}>
        Request a correction — {date}
      </p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="cr-what"
          style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
        >
          What needs correcting
        </label>
        <textarea
          id="cr-what"
          required
          rows={2}
          maxLength={500}
          value={whatNeedsCorrecting}
          onChange={(e) => setWhatNeedsCorrecting(e.target.value)}
          placeholder="e.g. Room count is wrong — should be 12 rooms sold, not 10"
          className="rounded border p-2"
          style={{
            fontSize: "var(--text-body)",
            borderColor: "var(--border-strong)",
            background: "var(--page)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="cr-should"
          style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
        >
          What it should be
        </label>
        <textarea
          id="cr-should"
          required
          rows={2}
          maxLength={500}
          value={whatItShouldBe}
          onChange={(e) => setWhatItShouldBe(e.target.value)}
          placeholder="e.g. 12 rooms sold, revenue RM 1,440"
          className="rounded border p-2"
          style={{
            fontSize: "var(--text-body)",
            borderColor: "var(--border-strong)",
            background: "var(--page)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="cr-reason"
          style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}
        >
          Reason
        </label>
        <textarea
          id="cr-reason"
          required
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Entered the wrong figure at 1am — checked the register this morning"
          className="rounded border p-2"
          style={{
            fontSize: "var(--text-body)",
            borderColor: "var(--border-strong)",
            background: "var(--page)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />
      </div>

      {error ? (
        <p
          role="alert"
          style={{ fontSize: "var(--text-caption)", color: "var(--warn)" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-card px-4 font-medium"
          style={{
            background: "var(--brand)",
            color: "var(--on-brand)",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-9 rounded-card border px-4"
          style={{
            borderColor: "var(--border-strong)",
            color: "var(--text-muted)",
            background: "none",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
