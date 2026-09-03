"use server";

import { requireUser } from "@/lib/auth";
import {
  PartnerInputSchema,
  ShareSetInputSchema,
  PartnerTransactionInputSchema,
} from "@/lib/partners";
import {
  ensurePartnerIndexes,
  createPartner,
  updatePartner,
  setShares,
  recordTransaction,
  updatePartnerTransaction,
  softDeletePartnerTransaction,
} from "@/lib/partnersStore";
import {
  ensurePaymentMethodsIndexes,
  getPaymentMethods,
} from "@/lib/paymentMethodsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addPartner(input: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = PartnerInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await ensurePartnerIndexes();
    await createPartner(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function editPartner(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = PartnerInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  try {
    await updatePartner(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveShares(input: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = ShareSetInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the shares." };
  }
  try {
    await setShares(parsed.data.effectiveFrom, parsed.data.lines, {
      id: user.sub,
      role: user.role,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function addTransaction(input: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = PartnerTransactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the entry." };
  }

  // Re-validate the payment method against the currently-active list — the
  // client's list can go stale between page load and submit (same guard as
  // expenses/revenue).
  await ensurePaymentMethodsIndexes();
  const active = (await getPaymentMethods()).filter((m) => m.active);
  if (!active.some((m) => m._id.toString() === parsed.data.paymentMethodId)) {
    return { ok: false, error: "That payment method is no longer available." };
  }

  try {
    await recordTransaction(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Edit a partner transaction (owner). Any field; full audit; the amount moves
 * the partner and account balances (computed on read). */
export async function editTransaction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = PartnerTransactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the entry." };
  }
  await ensurePaymentMethodsIndexes();
  const active = (await getPaymentMethods()).filter((m) => m.active);
  if (!active.some((m) => m._id.toString() === parsed.data.paymentMethodId)) {
    return { ok: false, error: "That payment method is no longer available." };
  }
  const after = await updatePartnerTransaction(id, parsed.data, { id: user.sub, role: user.role });
  if (!after) return { ok: false, error: "That transaction no longer exists or was deleted." };
  return { ok: true };
}

/** Soft-delete a partner transaction (owner). Required reason; never a hard
 * removal. */
export async function deleteTransaction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const user = await requireUser("owner");
  if (!reason.trim()) return { ok: false, error: "Enter a reason for deleting this transaction." };
  const after = await softDeletePartnerTransaction(id, reason.trim(), { id: user.sub, role: user.role });
  if (!after) return { ok: false, error: "That transaction no longer exists or was already deleted." };
  return { ok: true };
}
