import type { ReactNode } from "react";
import { isAuthorized, type Role } from "@/lib/session";
import { getPendingBusinessDays } from "@/lib/businessDays";
import { getCompanyDetails } from "@/lib/companyDetailsStore";
import { logout } from "@/app/login/actions";
import SidebarToggle from "./sidebar-toggle";
import NavList, { type NavGroupData, type NavItemData } from "./nav-list";

const ROLE_LABELS: Record<Role, string> = {
  reception: "Reception",
  manager: "Manager",
  owner: "Owner",
};

/** "Aisha Rahman" -> "AR"; a single name -> its first letter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * The one shared shell (sidebar + header) every authenticated route renders,
 * via its own layout.tsx — not a route-group restructure. Existing routes
 * (`/reception`, `/owner`) keep their paths and their own `requireUser()`
 * gate; this component only decides what's *visible*, never what's
 * *reachable* (CLAUDE.md rule 7 — access is enforced server-side by each
 * route's own guard, never by hiding a menu item — this filtering is a
 * convenience so a role never sees a link to somewhere it can't go).
 *
 * Grouped under muted uppercase labels (Daily / Money / People / Settings)
 * — a flat visual pattern, including Settings, which used to be a clickable
 * parent row with indented children (confirmed with the user: flatten it
 * to match the other three groups rather than keep the old nesting).
 */

interface NavItemDef {
  label: string;
  href: string;
  minRole: Role;
  icon: NavItemData["icon"];
}

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

// Icons are referenced by name, not by component — a lucide component
// reference isn't a plain object and can't cross the Server->Client
// boundary as a prop (NavList, which renders these, is a Client Component).
// nav-list.tsx's ICONS map resolves the name on the client; IconName there
// is a union of its keys, so a typo here fails to compile rather than
// silently rendering no icon.
const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "Daily",
    items: [
      { label: "Dashboard", href: "/dashboard", minRole: "manager", icon: "LayoutDashboard" },
      { label: "Front desk", href: "/reception", minRole: "reception", icon: "ClipboardList" },
      { label: "Bookings", href: "/bookings", minRole: "reception", icon: "BookMarked" },
      { label: "OTA", href: "/ota", minRole: "manager", icon: "Globe" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Revenue", href: "/revenue", minRole: "manager", icon: "TrendingUp" },
      { label: "Expenses", href: "/expenses", minRole: "manager", icon: "TrendingDown" },
      { label: "Accounts", href: "/accounts", minRole: "manager", icon: "Landmark" },
      { label: "Reports", href: "/reports", minRole: "reception", icon: "FileText" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Employees", href: "/employees", minRole: "manager", icon: "Users" },
      { label: "Salary", href: "/salary", minRole: "owner", icon: "Wallet" },
      { label: "Partners", href: "/partners", minRole: "owner", icon: "Handshake" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Categories", href: "/settings/categories", minRole: "manager", icon: "Tag" },
      { label: "Payment methods", href: "/settings/payment-methods", minRole: "manager", icon: "CreditCard" },
      { label: "OTA platforms", href: "/settings/ota-platforms", minRole: "manager", icon: "Settings" },
      { label: "Letter templates", href: "/settings/letter-templates", minRole: "manager", icon: "Mail" },
      { label: "Company details", href: "/settings/company", minRole: "owner", icon: "Building2" },
      { label: "Accounts", href: "/settings/accounts", minRole: "owner", icon: "Landmark" },
      { label: "Users", href: "/settings/users", minRole: "owner", icon: "UserCog" },
    ],
  },
];

function visibleGroups(
  role: Role,
  groups: NavGroupDef[],
  pendingCount: number,
): NavGroupData[] {
  return groups
    .map((g) => ({
      label: g.label,
      items: g.items
        .filter((item) => isAuthorized(role, item.minRole))
        .map((item) => ({
          label: item.label,
          href: item.href,
          icon: item.icon,
          badge: item.href === "/reception" ? pendingCount || undefined : undefined,
        })),
    }))
    .filter((g) => g.items.length > 0);
}

function LogoMark({ letter }: { letter: string }) {
  return (
    <span
      className="logo-mark flex shrink-0 items-center justify-center"
      style={{ width: 30, height: 30, fontSize: 15, fontWeight: 700 }}
      aria-hidden="true"
    >
      {letter}
    </span>
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
  const [pendingCount, company] = await Promise.all([
    isAuthorized(role, "manager")
      ? getPendingBusinessDays().then((d) => d.length)
      : Promise.resolve(0),
    // The brand shown in the shell comes from Settings > Company details, not a
    // hardcoded string.
    getCompanyDetails(),
  ]);
  const brand = company.tradingName || "Accounts";
  const logoLetter = brand.trim()[0]?.toUpperCase() ?? "•";
  const groups = visibleGroups(role, NAV_GROUPS, pendingCount);

  const nav = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavList groups={groups} />
      </div>
      {/* User info + sign out live in the sidebar itself (not a separate
          desktop-only header bar) so they're reachable the same way on
          mobile — inside the drawer — as on desktop. Pinned below the
          scrollable nav list (mt-auto, outside the overflow area) rather
          than relying on justify-between across the whole sidebar height,
          which used to let a tall nav list push this card out of view. */}
      <div className="mt-auto shrink-0 p-3">
        <div className="user-card flex flex-col gap-2 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex shrink-0 items-center justify-center rounded-full"
              style={{
                width: 32,
                height: 32,
                background: "var(--brand-tint)",
                color: "var(--brand)",
                fontSize: "var(--text-caption)",
                fontWeight: 600,
              }}
              aria-hidden="true"
            >
              {initials(userName)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span
                className="truncate"
                style={{ fontSize: "var(--text-label)", color: "var(--text)" }}
              >
                {userName}
              </span>
              <span style={{ fontSize: "var(--text-caption)", color: "var(--text-faint)" }}>
                {ROLE_LABELS[role]}
              </span>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full text-left"
              style={{ fontSize: "var(--text-label)", color: "var(--brand)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center gap-2">
      <LogoMark letter={logoLetter} />
      <span style={{ fontWeight: 600 }}>{brand}</span>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SidebarToggle header={header}>{nav}</SidebarToggle>
      <main className="min-w-0 flex-1 p-4">{children}</main>
    </div>
  );
}
