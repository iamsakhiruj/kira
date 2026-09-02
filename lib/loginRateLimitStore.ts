/**
 * `loginAttempts` DB access. Node runtime only — see lib/loginRateLimit.ts
 * for the pure lockout-schedule math this builds on.
 *
 * One document per {keyType, key} — "email" keyed by the attempted email
 * (lowercased), "ip" keyed by the source IP. Both are checked on every
 * login attempt; either being locked blocks it. Never a Mongo transaction
 * here — each write only ever touches one key's own document.
 */

import { type Collection, type Document } from "mongodb";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import { lockoutDurationMinutes } from "./loginRateLimit";

type KeyType = "email" | "ip";

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("loginAttempts");
}

export async function ensureLoginAttemptsIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ keyType: 1, key: 1 }, { unique: true });
}

function minutesRemaining(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
}

/**
 * Read-only: is the email or the IP currently locked out? Called before
 * touching the user record or verifying a password, so a locked-out
 * attempt costs nothing but a read plus this one audit write — no wasted
 * Argon2 work, no timing difference from a real credential check.
 */
export async function checkLoginLock(
  email: string,
  ip: string,
): Promise<{ blocked: boolean; retryAfterMinutes?: number }> {
  const col = await collection();
  const now = new Date();
  const [emailDoc, ipDoc] = await Promise.all([
    col.findOne({ keyType: "email", key: email }),
    col.findOne({ keyType: "ip", key: ip }),
  ]);

  const locks = [emailDoc, ipDoc]
    .map((d) => d?.lockedUntil as Date | null | undefined)
    .filter((d): d is Date => d != null && d > now);

  if (locks.length === 0) return { blocked: false };

  const retryAfterMinutes = Math.max(...locks.map((l) => minutesRemaining(l, now)));

  await recordAudit({
    actorId: email,
    action: "login_failed",
    collection: "loginAttempts",
    documentId: email,
    before: null,
    after: { email, ip, reason: "locked_out" },
  });

  return { blocked: true, retryAfterMinutes };
}

async function bumpFailure(keyType: KeyType, key: string): Promise<number> {
  const col = await collection();
  const after = await col.findOneAndUpdate(
    { keyType, key },
    { $inc: { failureCount: 1 }, $setOnInsert: { lockedUntil: null } },
    { upsert: true, returnDocument: "after" },
  );
  const failureCount = (after?.failureCount as number | undefined) ?? 1;

  const minutes = lockoutDurationMinutes(failureCount);
  if (minutes != null) {
    const lockedUntil = new Date(Date.now() + minutes * 60000);
    await col.updateOne({ keyType, key }, { $set: { lockedUntil } });
  }

  return failureCount;
}

/**
 * Record a failed attempt against both keys and audit-log it once. Only
 * ever called when checkLoginLock() just said neither key was locked, so
 * the schedule escalates monotonically — no risk of a stale lockedUntil
 * shortening what should be a longer window.
 */
export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  const [emailFailureCount, ipFailureCount] = await Promise.all([
    bumpFailure("email", email),
    bumpFailure("ip", ip),
  ]);

  await recordAudit({
    actorId: email,
    action: "login_failed",
    collection: "loginAttempts",
    documentId: email,
    before: null,
    after: { email, ip, reason: "bad_credentials", emailFailureCount, ipFailureCount },
  });
}

/** Reset the email key's counter and lock on a successful login. The IP
 * key is left untouched — see lib/loginRateLimit.ts's file comment. */
export async function recordLoginSuccess(email: string): Promise<void> {
  const col = await collection();
  await col.updateOne(
    { keyType: "email", key: email },
    { $set: { failureCount: 0, lockedUntil: null } },
    { upsert: true },
  );
}
