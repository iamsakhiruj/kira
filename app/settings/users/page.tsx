import { requireUser } from "@/lib/auth";
import { ensureUserIndexes, listUsers } from "@/lib/users";
import PageHeader from "@/components/ui/page-header";
import UsersManager from "./users-manager";

// Read the current list on every request; cheap, and avoids a stale list after
// an edit. The layout already gates this route to owner; requireUser here gets
// us the current user's id so we can flag their own row (no self-lockout).
export const dynamic = "force-dynamic";

// Format a timestamp in KL time as "YYYY-MM-DD HH:mm" — no month names, so it
// doesn't depend on ICU's locale-specific abbreviations (see businessDate.ts
// for why that drift bites). The client never formats dates.
const klDateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatKL(d: Date | null): string | null {
  if (!d) return null;
  const p = klDateTime.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export default async function UsersSettingsPage() {
  const actor = await requireUser("owner");
  await ensureUserIndexes();
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Users"
        description="Login accounts for staff. Deactivate an account instead of deleting it — a deleted user would orphan every night report and audit entry that references them."
        animate
      />
      <UsersManager
        currentUserId={actor.sub}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          lastSignIn: formatKL(u.lastSignInAt),
        }))}
      />
    </div>
  );
}
