/**
 * Password hashing with Argon2id (@node-rs/argon2 — prebuilt, no native build).
 * Node runtime only: never import this from middleware. Never store or log a
 * plaintext password (CLAUDE.md conventions).
 */

import { hash, verify } from "@node-rs/argon2";

const MIN_LENGTH = 8;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
  }
  return hash(plain);
}

export async function verifyPassword(
  passwordHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    // A malformed hash or verify error is a failed login, not a crash.
    return false;
  }
}
