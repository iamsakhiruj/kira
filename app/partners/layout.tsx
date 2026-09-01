import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

export default async function PartnersLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("owner");
  return (
    <AppShell role={user.role} userName={user.name}>
      {children}
    </AppShell>
  );
}
