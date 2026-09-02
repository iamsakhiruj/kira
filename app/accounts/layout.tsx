import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Manager+, same tier as /revenue and /expenses — CLAUDE.md rule 7. The
// partner-inclusive figures within the page are gated to owner separately
// (see actions.ts / page.tsx), not the whole route.
export default async function AccountsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("manager");
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
