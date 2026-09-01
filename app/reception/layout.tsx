import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Any authenticated role — reception fills in the night report, manager and
// owner also see the approval queue on this same page (see page.tsx). Which
// content renders is decided per-role inside the page, not by this gate;
// this just keeps unauthenticated requests out.
export default async function ReceptionLayout({
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
