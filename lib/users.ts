/**
 * The users collection: login accounts. Two roles. Passwords are stored only
 * as an Argon2 hash. Email is unique (enforced by index).
 */

import { ObjectId, type Collection, type WithId, type Document } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";

// All three roles. This list predates the `manager` tier (Phase 2 §2.1) and
// used to be just reception/owner — the schema below validates `role` against
// it, so a manager account couldn't be created until it was completed here.
export const ROLES = ["reception", "manager", "owner"] as const;

export const UserSchema = z.object({
  email: z
    .string()
    .email("Enter a valid email address.")
    .transform((e) => e.toLowerCase()),
  name: z.string().min(1, "Name is required."),
  role: z.enum(ROLES),
  passwordHash: z.string().min(1),
  active: z.boolean(),
  createdAt: z.date(),
  /** Last successful login instant. Absent until the user has signed in once. */
  lastSignInAt: z.date().optional(),
});

export type User = z.infer<typeof UserSchema>;
export type StoredUser = WithId<User>;

async function usersCollection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("users");
}

/** Create the unique index on email. Idempotent — safe to call repeatedly. */
export async function ensureUserIndexes(): Promise<void> {
  const col = await usersCollection();
  await col.createIndex({ email: 1 }, { unique: true });
}

export async function getUserByEmail(
  email: string,
): Promise<StoredUser | null> {
  const col = await usersCollection();
  return col.findOne({
    email: email.toLowerCase(),
  }) as Promise<StoredUser | null>;
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await usersCollection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredUser | null>;
}

/** Batch name lookup for display (e.g. a review queue listing many users' entries). */
export async function getUserNamesByIds(
  ids: string[],
): Promise<Map<string, string>> {
  const validIds = [...new Set(ids)].filter((id) => ObjectId.isValid(id));
  if (validIds.length === 0) return new Map();

  const col = await usersCollection();
  const users = await col
    .find(
      { _id: { $in: validIds.map((id) => new ObjectId(id)) } },
      { projection: { name: 1 } },
    )
    .toArray();

  return new Map(users.map((u) => [u._id.toString(), u.name as string]));
}

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  active?: boolean;
  createdAt?: Date;
}

/** Insert a user and write the audit entry (never the password hash to the log). */
export async function createUser(
  input: NewUser,
  actor: { id: string; role: Role },
): Promise<ObjectId> {
  const doc = UserSchema.parse({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: input.passwordHash,
    active: input.active ?? true,
    createdAt: input.createdAt ?? new Date(),
  });

  const col = await usersCollection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "users",
    documentId: res.insertedId.toString(),
    before: null,
    after: {
      email: doc.email,
      name: doc.name,
      role: doc.role,
      active: doc.active,
    },
  });

  return res.insertedId;
}

/**
 * Thrown when an owner tries to lock themselves out — deactivate or demote
 * their own account. There is no recovery path from zero reachable owners, so
 * this is refused at the store layer (the real guard), not just hidden in the
 * UI. Actions catch it to show a friendly message.
 */
export class SelfLockoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfLockoutError";
  }
}

/** A user as shown in the management list — never includes the password hash. */
export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  lastSignInAt: Date | null;
}

/**
 * List all accounts for the owner's management screen. The projection
 * excludes `passwordHash` outright, so the hash never leaves the database for
 * this query.
 */
export async function listUsers(): Promise<UserListItem[]> {
  const col = await usersCollection();
  const docs = await col
    .find(
      {},
      {
        projection: {
          email: 1,
          name: 1,
          role: 1,
          active: 1,
          createdAt: 1,
          lastSignInAt: 1,
        },
        sort: { createdAt: 1 },
      },
    )
    .toArray();

  return docs.map((d) => ({
    id: d._id.toString(),
    email: d.email as string,
    name: d.name as string,
    role: d.role as Role,
    active: d.active as boolean,
    createdAt: d.createdAt as Date,
    lastSignInAt: (d.lastSignInAt as Date | undefined) ?? null,
  }));
}

/** The audit-safe view of a user document — never the hash. */
function auditView(u: StoredUser) {
  return { email: u.email, name: u.name, role: u.role, active: u.active };
}

/**
 * Change an account's name and/or role. Audit-logged with before/after (never
 * the hash). An owner may not demote their own role away from owner
 * (SelfLockoutError).
 */
export async function updateUserProfile(
  id: string,
  changes: { name?: string; role?: Role },
  actor: { id: string; role: Role },
): Promise<void> {
  const before = await getUserById(id);
  if (!before) throw new Error("User not found.");

  const isSelf = actor.id === id;
  if (
    isSelf &&
    changes.role !== undefined &&
    changes.role !== "owner" &&
    before.role === "owner"
  ) {
    throw new SelfLockoutError("You can't change your own role away from owner.");
  }

  const set: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const name = changes.name.trim();
    if (name.length < 1) throw new Error("Name is required.");
    set.name = name;
  }
  if (changes.role !== undefined) {
    if (!ROLES.includes(changes.role)) throw new Error("Unknown role.");
    set.role = changes.role;
  }
  if (Object.keys(set).length === 0) return; // nothing to change

  const col = await usersCollection();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: set });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "users",
    documentId: id,
    before: auditView(before),
    after: { ...auditView(before), ...set },
  });
}

/**
 * Activate or deactivate an account. We never delete — a removed user would
 * orphan every audit entry and night report that references them. An owner
 * may not deactivate their own account (SelfLockoutError).
 */
export async function setUserActive(
  id: string,
  active: boolean,
  actor: { id: string; role: Role },
): Promise<void> {
  const before = await getUserById(id);
  if (!before) throw new Error("User not found.");

  if (actor.id === id && active === false) {
    throw new SelfLockoutError("You can't deactivate your own account.");
  }
  if (before.active === active) return; // already in the desired state

  const col = await usersCollection();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { active } });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "users",
    documentId: id,
    before: auditView(before),
    after: { ...auditView(before), active },
  });
}

/**
 * Set a new password hash directly (owner-initiated reset). The caller hashes
 * the plaintext; this never sees or logs it. The audit entry records only that
 * a reset happened — never the old or new hash.
 */
export async function resetUserPassword(
  id: string,
  passwordHash: string,
  actor: { id: string; role: Role },
): Promise<void> {
  if (typeof passwordHash !== "string" || passwordHash.length < 1) {
    throw new Error("A password hash is required.");
  }
  const before = await getUserById(id);
  if (!before) throw new Error("User not found.");

  const col = await usersCollection();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { passwordHash } });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "users",
    documentId: id,
    before: null,
    after: { passwordReset: true },
  });
}

/**
 * Stamp a successful login and record it in the audit log. Called from the
 * login action after the password is verified. The actor is the user
 * themselves.
 */
export async function recordSignIn(
  id: string,
  role: Role,
): Promise<void> {
  if (!ObjectId.isValid(id)) return;
  const at = new Date();
  const col = await usersCollection();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { lastSignInAt: at } });

  await recordAudit({
    actorId: id,
    actorRole: role,
    action: "login",
    collection: "users",
    documentId: id,
    before: null,
    after: { lastSignInAt: at },
    at,
  });
}
