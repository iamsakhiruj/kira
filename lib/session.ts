/**
 * Session tokens. Stateless: a signed JWT in an HttpOnly cookie. No sessions
 * collection in the database (it isn't in the Phase 1 spec). This module is
 * Edge-safe — it uses only `jose`, so `middleware.ts` can verify a session
 * without a Node runtime. Password hashing lives in lib/password.ts, which
 * must NOT be imported from middleware.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "hbkl_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const ALG = "HS256";

export type Role = "reception" | "manager" | "owner";

export interface SessionPayload {
  /** User _id as a string. */
  sub: string;
  role: Role;
  name: string;
}

/**
 * Role hierarchy: owner ≥ manager ≥ reception. A higher tier can reach any
 * route gated to a lower or equal one; a lower tier can never reach a higher
 * one. Manager sits strictly between the other two — day-to-day operations,
 * but not salary, partners, or profit (CLAUDE.md rule 7 spells out the
 * exclusions; this map only encodes the ordering).
 */
const RANK: Record<Role, number> = { reception: 1, manager: 2, owner: 3 };

/**
 * Is a user with `role` allowed where `required` is needed? With no
 * requirement, any authenticated user passes. Used by both the middleware
 * gate and the server-side guard so the rule lives in one place.
 */
export function isAuthorized(role: Role, required?: Role): boolean {
  if (!required) return true;
  return RANK[role] >= RANK[required];
}

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters. See .env.local.example.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getKey());
}

/** Verify and decode a token. Returns null on any failure (bad sig, expired, malformed). */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      algorithms: [ALG],
    });
    const sub = payload.sub;
    const role = payload.role;
    const name = payload.name;
    if (
      typeof sub !== "string" ||
      (role !== "reception" && role !== "manager" && role !== "owner") ||
      typeof name !== "string"
    ) {
      return null;
    }
    return { sub, role, name };
  } catch {
    return null;
  }
}
