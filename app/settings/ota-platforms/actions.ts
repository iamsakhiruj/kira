"use server";

import { requireUser } from "@/lib/auth";
import { OtaPlatformInputSchema } from "@/lib/otaPlatforms";
import {
  ensureOtaPlatformsIndexes,
  createOtaPlatform,
  updateOtaPlatform,
} from "@/lib/otaPlatformsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addOtaPlatform(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = OtaPlatformInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await ensureOtaPlatformsIndexes();
    await createOtaPlatform(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    throw err;
  }
}

export async function editOtaPlatform(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = OtaPlatformInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await updateOtaPlatform(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function setOtaPlatformActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  try {
    await updateOtaPlatform(id, { active }, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
