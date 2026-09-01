import type { ReactNode } from "react";
import Link from "next/link";
import { isAuthorized, type Role } from "@/lib/session";
import { getPendingBusinessDays } from "@/lib/businessDays";
import { logout } from "@/app/login/actions";
import SidebarToggle from "./sidebar-toggle";

/**
 * The one shared shell (sidebar + header) every authenticated route renders,
 * via its own layout.tsx — not a route-group restructure. Existing routes
 * (`/reception`, `/owner`) keep their paths and their own `requireUser()`
 * gate; this component only decides what's *visible*, never what's
 * *reachable* (CLAUDE.md rule 7 — access is enforced server-side by each
 * route's own guard, never by hiding a menu item — this filtering is a
 * convenience so a role never sees a link to somewhere it can't go).
 */

interface NavItem {
  label: string;
  href?: string;
  minRole: Role;
  children?: NavItem[];
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", minRole: "manager" },
  { label: "Front desk", href: "/reception", minRole: "reception" },
  { label: "Revenue", href: "/revenue", minRole: "manager" },
  { label: "Expenses", href: "/expenses", minRole: "manager" },
  { label: "Employees", href: "/employees", minRole: "manager" },
  { label: "Salary", href: "/salary", minRole: "owner" },
  { label: "Partners", href: "/partners", minRole: "owner" },
  { label: "Reports", href: "/reports", minRole: "manager" },
  {
    label: "Settings",
    minRole: "manager",
    children: [
      { label: "Payment methods", href: "/settings/payment-methods", minRole: "manager" },
      { label: "Users", href: "/settings/users", minRole: "owner" },
    ],
  },
];

function visibleFor(role: Role, items: NavItem[]): NavItem[] {
  return items
    .filter((item) => isAuthorized(role, item.minRole))
    .map((item) =>
      item.children ? { ...item, children: visibleFor(role, item.children) } : item,
    )
    .filter((item) => !item.children || item.children.length > 0);
}

function NavLink({
  item,
  badge,
}: {
  item: NavItem;
  badge?: number;
}) {
  if (!item.href) {
    return (
      <div
        className="px-3 pt-3 pb-1"
        style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}
      >
        {item.label}
      </div>
    );
  }
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between rounded px-3 py-2"
      style={{ fontSize: "var(--text-label)", color: "var(--text)" }}
    >
      <span>{item.label}</span>
      {badge ? (
        <span
          className="rounded-full px-2 py-0.5"
          style={{
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            background: "var(--warn-bg)",
            color: "var(--warn)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default async function AppShell({
  role,
  userName,
  children,
}: {
  role: Role;
  userName: string;
  children: ReactNode;
}) {
  const items = visibleFor(role, NAV);
  const pendingCount = isAuthorized(role, "manager")
    ? (await getPendingBusinessDays()).length
    : 0;

  const nav = (
    <div className="flex flex-1 flex-col justify-between">
      <nav className="flex flex-col gap-0.5 p-2">
        {items.map((item) =>
          item.children ? (
            <div key={item.label}>
              <NavLink item={item} />
              <div className="ml-2 flex flex-col gap-0.5">
                {item.children.map((child) => (
                  <NavLink key={child.href} item={child} />
                ))}
              </div>
            </div>
          ) : (
            <NavLink
              key={item.href}
              item={item}
              badge={item.href === "/reception" ? pendingCount : undefined}
            />
          ),
        )}
      </nav>
      {/* User info + sign out live in the sidebar itself (not a separate
          desktop-only header bar) so they're reachable the same way on
          mobile — inside the drawer — as on desktop. */}
      <div
        className="flex items-center justify-between border-t p-3"
        style={{ borderColor: "var(--border)" }}
      >
        <span style={{ fontSize: "var(--text-label)", color: "var(--text-muted)" }}>
          {userName}
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
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SidebarToggle header={<span style={{ fontWeight: 600 }}>Hotel Bintang KL</span>}>
        {nav}
      </SidebarToggle>
      <main className="min-w-0 flex-1 p-4">{children}</main>
    </div>
  );
}
