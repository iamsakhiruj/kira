"use server";

import { requireUser } from "@/lib/auth";
import { LetterTemplateInputSchema } from "@/lib/bookings";
import {
  ensureLetterTemplateIndexes,
  createLetterTemplate,
  updateLetterTemplate,
} from "@/lib/letterTemplatesStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addLetterTemplate(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");
  const parsed = LetterTemplateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await ensureLetterTemplateIndexes();
    await createLetterTemplate(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    throw err;
  }
}

export async function editLetterTemplate(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  const parsed = LetterTemplateInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await updateLetterTemplate(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function setLetterTemplateActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  try {
    await updateLetterTemplate(id, { active }, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
