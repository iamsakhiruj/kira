import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

export default async function ExpensesLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("manager");
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
