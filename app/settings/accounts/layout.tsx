import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/app-shell";

// Owner-only — see actions.ts for why (opening balance is foundational,
// unlike the manager+ payment-methods/categories/OTA-platforms settings).
export default async function SettingsAccountsLayout({
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
