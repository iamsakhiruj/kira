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
import {
  SESSION_COOKIE,
  verifySessionToken,
  isAuthorized,
  type Role,
} from "@/lib/session";

// One entry per gated route prefix. None of these nest inside another (e.g.
// /settings/payment-methods and /settings/users are siblings, not a shared
// /settings parent with sections hidden inside) — see those routes'
// layout.tsx for why that matters. Order doesn't matter as long as that
// holds; add new prefixes here as Phase 2 routes land.
const ROUTE_REQUIREMENTS: { prefix: string; required: Role }[] = [
  { prefix: "/owner", required: "owner" },
  { prefix: "/reception", required: "reception" },
  { prefix: "/settings/payment-methods", required: "manager" },
  { prefix: "/settings/users", required: "owner" },
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const required = ROUTE_REQUIREMENTS.find((r) =>
    pathname.startsWith(r.prefix),
  )?.required;

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
  matcher: ["/owner/:path*", "/reception/:path*", "/settings/:path*"],
};
