/**
 * Coarse route gate (Next.js "proxy", formerly middleware). Runs on the Edge
 * runtime, so it uses only the Edge-safe session module (jose) — no database,
 * no password hashing here. The real enforcement is requireUser() in each
 * protected layout/page; this just keeps unauthenticated and wrong-role
 * requests from reaching them at all.
 *
 *   unauthenticated           -> 302 to /login?next=<path>
 *   authenticated, wrong role -> 403
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken, isAuthorized } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const required = pathname.startsWith("/owner")
    ? "owner"
    : pathname.startsWith("/reception")
      ? "reception"
      : undefined;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!isAuthorized(session.role, required)) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { "content-type": "text/plain" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/reception/:path*"],
};
