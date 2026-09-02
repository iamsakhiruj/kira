"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFirstLoadAnimation } from "./ui/use-first-load-animation";
import {
  LayoutDashboard,
  ClipboardList,
  Globe,
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Wallet,
  Handshake,
  Settings,
  Tag,
  CreditCard,
  UserCog,
  Landmark,
} from "lucide-react";

// A lucide component isn't a plain object — it can't cross the
// Server->Client boundary as a prop. The server builds nav data with an
// icon *name*; this map resolves it to the actual component on the client.
// An explicit map (not a dynamic import) keeps the bundle to only the
// icons actually used and stays type-safe — IconName below is a union of
// its keys, so a typo in the server-side config fails at compile time
// instead of silently rendering no icon.
const ICONS = {
  LayoutDashboard,
  ClipboardList,
  Globe,
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Wallet,
  Handshake,
  Settings,
  Tag,
  CreditCard,
  UserCog,
  Landmark,
} as const;

export type IconName = keyof typeof ICONS;

export interface NavItemData {
  label: string;
  href: string;
  icon: IconName;
  badge?: number;
}

export interface NavGroupData {
  label: string;
  items: NavItemData[];
}

const STAGGER_MS = 30;

function NavRow({
  item,
  active,
  animate,
  delayMs,
}: {
  item: NavItemData;
  active: boolean;
  animate: boolean;
  delayMs: number;
}) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      className={`nav-item flex items-center gap-2 px-3 py-2 ${active ? "nav-item-active" : ""} ${animate ? "nav-item-animate-in" : ""}`}
      style={animate ? { animationDelay: `${delayMs}ms` } : undefined}
      suppressHydrationWarning
    >
      <Icon size={16} style={{ color: active ? "#fff" : "var(--text-faint)" }} />
      <span
        className="min-w-0 flex-1 truncate"
        style={{ fontSize: "var(--text-label)", color: active ? "#fff" : "var(--text)" }}
      >
        {item.label}
      </span>
      {item.badge ? (
        <span
          className={`rounded-full px-2 py-0.5 ${active ? "nav-badge-active" : "nav-badge-inactive"}`}
          style={{ fontSize: "var(--text-caption)", fontWeight: 600 }}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function NavList({ groups }: { groups: NavGroupData[] }) {
  const pathname = usePathname();
  const animate = useFirstLoadAnimation();

  // A pure lookup, not a counter incremented during render (the React
  // Compiler's lint rule flags mutating a local variable inside render,
  // even one re-initialized fresh every call) — the stagger delay for each
  // item is just its position across the flattened, grouped list.
  const flatItems = groups.flatMap((g) => g.items);
  const delayByHref = new Map(flatItems.map((item, i) => [item.href, i * STAGGER_MS]));

  return (
    <nav className="flex flex-col gap-3 p-3">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div className="nav-group-label px-3 pb-1">{group.label}</div>
          {group.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <NavRow
                key={item.href}
                item={item}
                active={active}
                animate={animate}
                delayMs={delayByHref.get(item.href) ?? 0}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );
}
