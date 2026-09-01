"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveNightReport } from "./actions";

export default function ApproveButton({
  businessDayId,
}: {
  businessDayId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    setPending(true);
    try {
      const res = await approveNightReport(businessDayId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't approve — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleApprove}
        className="h-9 rounded-card px-4 font-medium"
        style={{
          background: "var(--brand)",
          color: "var(--on-brand)",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Approving…" : "Approve"}
      </button>
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
