import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

// Owner-only — a separate gate from /settings/payment-methods (manager+),
// not a shared /settings parent with sections hidden inside. See that
// route's layout.tsx for why.
export default async function UsersSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("owner");

  return (
    <div className="min-h-screen">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <span style={{ fontWeight: 600 }}>Settings — Users</span>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
            {user.name}
          </span>
          <form action={logout}>
            <button
              type="submit"
              style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
