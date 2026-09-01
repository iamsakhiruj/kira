import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export default async function OwnerLayout({
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
        <span style={{ fontWeight: 600 }}>Owner console</span>
        <div className="flex items-center gap-3">
          <Link
            href="/reception"
            style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
          >
            Front desk
          </Link>
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
