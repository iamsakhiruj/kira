"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserByEmail, recordSignIn } from "@/lib/users";
import { verifyPassword } from "@/lib/password";
import { DbUnavailableError } from "@/lib/mongodb";
import { maskConnectionString } from "@/lib/mongoUri";
import {
  ensureLoginAttemptsIndexes,
  checkLoginLock,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/loginRateLimitStore";
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

/** Best-effort source IP for rate-limiting — reads the standard proxy
 * headers; "unknown" locally or behind a proxy that sets neither. */
async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

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

  const email = parsed.data.email.toLowerCase();
  const ip = await getClientIp();

  // One generic message for every auth failure — never reveal whether the
  // email exists or the password was wrong.
  const fail: LoginState = { error: "Wrong email or password." };

  // Rate limiting first, before touching the user record or verifying a
  // password — a locked-out attempt costs nothing but a read, and no
  // Argon2 work happens for an attempt that was never going to succeed.
  // Fails open (proceeds as if unlocked) on a DB error here; a real outage
  // still surfaces properly via the credential check below.
  try {
    await ensureLoginAttemptsIndexes();
    const lock = await checkLoginLock(email, ip);
    if (lock.blocked) {
      const minutes = lock.retryAfterMinutes ?? 1;
      return {
        error: `Too many failed attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
  } catch (err) {
    console.error("[login] rate limit check: " + maskConnectionString(describeError(err)));
  }

  let user: Awaited<ReturnType<typeof getUserByEmail>> = null;
  try {
    const found = await getUserByEmail(email);
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
    await recordLoginFailure(email, ip).catch((e) =>
      console.error("[login] recordLoginFailure: " + maskConnectionString(describeError(e))),
    );
    return fail;
  }

  if (!user) {
    await recordLoginFailure(email, ip).catch((err) =>
      console.error("[login] recordLoginFailure: " + maskConnectionString(describeError(err))),
    );
    return fail;
  }

  // Stamp the sign-in (and audit it), and reset the email's failure count.
  // A failure here must not block a valid login — the user is authenticated
  // regardless of whether we recorded it.
  try {
    await recordSignIn(user._id.toString(), user.role);
    await recordLoginSuccess(email);
  } catch (err) {
    console.error("[login] recordSignIn: " + maskConnectionString(describeError(err)));
  }

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
