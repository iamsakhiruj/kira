import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Gated at manager — this route, not a shared /settings parent. One guard
// per route (CLAUDE.md rule 7): a manager-gated parent with sections hidden
// inside would leave /settings/users reachable by URL for anyone who can
// reach /settings at all.
export default async function OtaPlatformsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("manager");
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
