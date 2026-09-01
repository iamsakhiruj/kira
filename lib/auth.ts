/**
 * Server-side access control. This runs in every protected layout, page,
 * server action, and data query — access is NEVER enforced by hiding UI
 * (CLAUDE.md rule 7). Node runtime (reads cookies, hits the database).
 *
 * The middleware in middleware.ts is a coarse first gate; this is the real
 * one. Both use isAuthorized() from lib/session.ts so the rule lives in one
 * place.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  verifySessionToken,
  isAuthorized,
  type Role,
  type SessionPayload,
} from "./session";
import { getUserById } from "./users";

export function homeFor(role: Role): string {
  return role === "owner" ? "/owner" : "/reception";
}

/** The current session from the cookie, or null. Cheap — no database hit. */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Require an authenticated user, optionally of a given role. Verifies the
 * account still exists and is active (a session outliving a deactivated user
 * must not keep working). Redirects rather than returning on failure.
 */
export async function requireUser(required?: Role): Promise<SessionPayload> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const dbUser = await getUserById(session.sub);
  if (!dbUser || dbUser.active !== true) {
    redirect("/login");
  }

  if (!isAuthorized(session.role, required)) {
    // Authenticated but wrong role: send them to their own area.
    redirect(homeFor(session.role));
  }

  return session;
}
