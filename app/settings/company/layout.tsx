import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Owner only — company identity appears on legal documents. Its own gate
// (CLAUDE.md rule 7: one route, one gate); proxy.ts also lists this prefix at
// "owner".
export default async function CompanySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("owner");
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
