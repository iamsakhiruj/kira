/**
 * The users collection: login accounts. Two roles. Passwords are stored only
 * as an Argon2 hash. Email is unique (enforced by index).
 */

import { ObjectId, type Collection, type WithId, type Document } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";

export const ROLES = ["reception", "owner"] as const;

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
