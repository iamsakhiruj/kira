"use server";

import { requireUser } from "@/lib/auth";
import { CategoryInputSchema } from "@/lib/categories";
import {
  ensureCategoriesIndexes,
  createCategory,
  updateCategory,
} from "@/lib/categoriesStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addCategory(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = CategoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await ensureCategoriesIndexes();
    await createCategory(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    throw err;
  }
}

export async function editCategory(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = CategoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await updateCategory(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser("manager");
  try {
    await updateCategory(id, { active }, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
