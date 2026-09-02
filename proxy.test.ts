/**
 * Fails if any route under app/ is missing from proxy.ts's `config.matcher`
 * or `ROUTE_REQUIREMENTS` — the two lists that must agree for the Edge gate
 * to actually run on a route (matcher) and know what role it requires
 * (ROUTE_REQUIREMENTS). Both `/ota` and `/settings/ota-platforms` shipped
 * without one or the other; this is cheaper than remembering next time.
 *
 * Deliberately public routes go in PUBLIC_ROUTES below — an explicit
 * allowlist, not an inferred one, so leaving a route out of it is a
 * conscious choice, not an accident this test can't see.
 */

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTE_REQUIREMENTS, config as proxyConfig } from "./proxy";

/** Routes that intentionally have no Edge gate — must not silently grow. */
const PUBLIC_ROUTES = new Set<string>([
  "/", // app/page.tsx: redirects to /login or the user's home, no protected data
  "/login",
]);

const ROUTE_FILE_NAMES = new Set(["page.tsx", "route.ts", "route.tsx"]);

function collectRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(full));
    } else if (ROUTE_FILE_NAMES.has(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function toRoutePath(filePath: string, appDir: string): string {
  const segments = relative(appDir, filePath).split(sep);
  segments.pop(); // drop the page.tsx / route.ts filename itself
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

const appDir = fileURLToPath(new URL("./app", import.meta.url));
const routePaths = collectRouteFiles(appDir)
  .map((f) => toRoutePath(f, appDir))
  .sort();

// Next's matcher glob ("/owner/:path*") matches "/owner" and anything under
// it — a path-segment boundary, not a plain substring/startsWith prefix.
const matcherPrefixes = proxyConfig.matcher.map((m) => m.replace(/\/:path\*$/, ""));
function coveredByMatcher(routePath: string): boolean {
  return matcherPrefixes.some((p) => routePath === p || routePath.startsWith(`${p}/`));
}

// Mirrors proxy()'s own `pathname.startsWith(r.prefix)` check exactly, so
// this test verifies the real runtime matching behaviour, not a stricter
// approximation of it.
function coveredByRequirements(routePath: string): boolean {
  return ROUTE_REQUIREMENTS.some((r) => routePath.startsWith(r.prefix));
}

describe("proxy route-gate completeness", () => {
  it("found routes under app/ to check", () => {
    // A sanity check on the scan itself — if this is ever 0, every
    // assertion below is vacuously true and the test isn't testing anything.
    expect(routePaths.length).toBeGreaterThan(0);
  });

  const gatedRoutes = routePaths.filter((p) => !PUBLIC_ROUTES.has(p));

  it.each(gatedRoutes)("%s is covered by proxy.ts's config.matcher", (routePath) => {
    expect(
      coveredByMatcher(routePath),
      `No matcher entry in proxy.ts's config.matcher covers ${routePath}. ` +
        `Add its top-level prefix (e.g. "${routePath.split("/").slice(0, 2).join("/")}/:path*") ` +
        `to config.matcher, or add ${routePath} to PUBLIC_ROUTES in this test if it's deliberately public.`,
    ).toBe(true);
  });

  it.each(gatedRoutes)("%s is covered by ROUTE_REQUIREMENTS", (routePath) => {
    expect(
      coveredByRequirements(routePath),
      `No entry in proxy.ts's ROUTE_REQUIREMENTS covers ${routePath}. ` +
        `Add { prefix: "...", required: ... } for it, or add ${routePath} to ` +
        `PUBLIC_ROUTES in this test if it's deliberately public.`,
    ).toBe(true);
  });
});
