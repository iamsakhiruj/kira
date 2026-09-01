"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
import { DbUnavailableError } from "@/lib/mongodb";
import { maskConnectionString } from "@/lib/mongoUri";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/session";
import { homeFor } from "@/lib/auth";

export interface LoginState {
  error: string;
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** A one-line, password-safe description of an error for server-side logs. */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeMsg =
      cause instanceof Error ? ` | cause: ${cause.name}: ${cause.message}` : "";
    return `${err.name}: ${err.message}${causeMsg}`;
  }
  return String(err);
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  // One generic message for every auth failure — never reveal whether the
  // email exists or the password was wrong.
  const fail: LoginState = { error: "Wrong email or password." };

  let user: Awaited<ReturnType<typeof getUserByEmail>> = null;
  try {
    const found = await getUserByEmail(parsed.data.email);
    if (found && found.active === true) {
      const ok = await verifyPassword(found.passwordHash, parsed.data.password);
      if (ok) user = found;
    }
  } catch (err) {
    // Log the real cause server-side (password masked) so it's debuggable...
    console.error("[login] " + maskConnectionString(describeError(err)));
    // ...but only claim the database is down when it actually is. Any other
    // unexpected error (e.g. during password verification) is a failed login,
    // not a reason to mislead the user about infrastructure.
    if (err instanceof DbUnavailableError) {
      return { error: "Cannot reach the database. Contact your administrator." };
    }
    return fail;
  }

  if (!user) return fail;

  const token = await createSessionToken({
    sub: user._id.toString(),
    role: user.role,
    name: user.name,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(homeFor(user.role));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
