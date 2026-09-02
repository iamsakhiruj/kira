"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  ensureProfitAllocationIndexes,
  generateOrRefreshDraft,
  lockAllocation,
  createAdjustment,
} from "@/lib/profitAllocationStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Pick a month.");

export async function allocateMonth(month: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = MonthSchema.safeParse(month);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await ensureProfitAllocationIndexes();
    await generateOrRefreshDraft(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function lockMonth(id: string): Promise<ActionResult> {
  const user = await requireUser("owner");
  try {
    const done = await lockAllocation(id, { id: user.sub, role: user.role });
    if (!done) return { ok: false, error: "That allocation was already locked." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function adjustMonth(id: string): Promise<ActionResult> {
  const user = await requireUser("owner");
  try {
    await createAdjustment(id, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
