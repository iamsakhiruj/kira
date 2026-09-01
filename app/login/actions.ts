"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
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

  // One generic message for every failure — never reveal whether the email
  // exists or the password was wrong.
  const fail: LoginState = { error: "Wrong email or password." };

  const user = await getUserByEmail(parsed.data.email);
  if (!user || user.active !== true) return fail;

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) return fail;

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
