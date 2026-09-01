import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export default async function ReceptionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("reception");

  return (
    <div className="min-h-screen">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <span style={{ fontWeight: 600 }}>Front desk</span>
        <div className="flex items-center gap-3">
          {user.role === "owner" ? (
            <Link
              href="/owner"
              style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
            >
              Owner console
            </Link>
          ) : null}
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
