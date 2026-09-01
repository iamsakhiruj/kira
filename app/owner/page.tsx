import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Retired — the approval queue that used to live here now lives on
// /reception (Phase 2 §5's sidebar has no separate "approvals" item; Front
// desk covers night reports broadly, see app/reception/approval-queue.tsx).
// Kept as an owner-gated redirect rather than deleted outright, in case
// anything still links to the old URL.
export default async function OwnerPage() {
  await requireUser("owner");
  redirect("/reception");
}
