import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

// Gated at manager — this route, not a shared /settings parent. One guard
// per route (CLAUDE.md rule 7): a manager-gated parent with sections hidden
// inside would leave /settings/users reachable by URL for anyone who can
// reach /settings at all.
export default async function PaymentMethodsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("manager");

  return (
    <div className="min-h-screen">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <span style={{ fontWeight: 600 }}>Settings — Payment methods</span>
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
