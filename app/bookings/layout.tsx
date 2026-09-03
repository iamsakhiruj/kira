import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Any authenticated role — reception creates bookings, records payments and
// generates letters; manager/owner also edit, cancel and refund. The finer
// per-action gates live in the server actions (app/bookings/actions.ts), never
// in hidden UI (CLAUDE.md rule 7). This gate just keeps unauthenticated
// requests out.
export default async function BookingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
