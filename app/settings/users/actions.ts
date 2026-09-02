"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { checkPasswordStrength } from "@/lib/passwordPolicy";
import { ROLES } from "@/lib/users";
import {
  ensureUserIndexes,
  createUser,
  updateUserProfile,
  setUserActive,
  resetUserPassword,
  SelfLockoutError,
} from "@/lib/users";

export type ActionResult = { ok: true } | { ok: false; error: string };

const EmailSchema = z
  .string()
  .email("Enter a valid email address.")
  .transform((e) => e.toLowerCase());
const NameSchema = z.string().trim().min(1, "Name is required.");
const RoleSchema = z.enum(ROLES);

const AddUserSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  role: RoleSchema,
  password: z.string(),
});

export async function addUser(input: unknown): Promise<ActionResult> {
  const actor = await requireUser("owner");

  const parsed = AddUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { name, email, role, password } = parsed.data;

  const strength = checkPasswordStrength(password, email);
  if (!strength.ok) {
    return { ok: false, error: strength.error ?? "Choose a stronger password." };
  }

  try {
    await ensureUserIndexes();
    const passwordHash = await hashPassword(password);
    await createUser(
      { email, name, role, passwordHash, active: true },
      { id: actor.sub, role: actor.role },
    );
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `${email} is already in use.` };
    }
    throw err;
  }
}

const EditUserSchema = z.object({
  name: NameSchema.optional(),
  role: RoleSchema.optional(),
});

export async function editUser(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const actor = await requireUser("owner");

  const parsed = EditUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await updateUserProfile(id, parsed.data, { id: actor.sub, role: actor.role });
    return { ok: true };
  } catch (err) {
    if (err instanceof SelfLockoutError) return { ok: false, error: err.message };
    return { ok: false, error: (err as Error).message };
  }
}

export async function setActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const actor = await requireUser("owner");
  try {
    await setUserActive(id, active, { id: actor.sub, role: actor.role });
    return { ok: true };
  } catch (err) {
    if (err instanceof SelfLockoutError) return { ok: false, error: err.message };
    return { ok: false, error: (err as Error).message };
  }
}

export async function resetPassword(
  id: string,
  password: unknown,
): Promise<ActionResult> {
  const actor = await requireUser("owner");

  if (typeof password !== "string") {
    return { ok: false, error: "Enter a password." };
  }
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return { ok: false, error: strength.error ?? "Choose a stronger password." };
  }

  try {
    const passwordHash = await hashPassword(password);
    await resetUserPassword(id, passwordHash, { id: actor.sub, role: actor.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
