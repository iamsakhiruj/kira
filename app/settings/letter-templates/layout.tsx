import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Manage letter templates is manager+ (brief §5). Its own gate — one route,
// one gate (CLAUDE.md rule 7); proxy.ts also lists this prefix at "manager".
export default async function LetterTemplatesLayout({
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
