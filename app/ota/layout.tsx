import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Manager+ — same tier as /revenue and /expenses (CLAUDE.md rule 7): this
// isn't profit/salary-adjacent, so it doesn't need owner-only.
export default async function OtaLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("manager");
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
