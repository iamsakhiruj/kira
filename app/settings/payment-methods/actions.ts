"use server";

import { requireUser } from "@/lib/auth";
import { PaymentMethodInputSchema } from "@/lib/paymentMethods";
import {
  ensurePaymentMethodsIndexes,
  createPaymentMethod,
  updatePaymentMethod,
} from "@/lib/paymentMethodsStore";
import { setPaymentMethodAccount as setPaymentMethodAccountStore } from "@/lib/accountsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addPaymentMethod(input: unknown): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = PaymentMethodInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await ensurePaymentMethodsIndexes();
    await createPaymentMethod(parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    throw err;
  }
}

export async function editPaymentMethod(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser("manager");

  const parsed = PaymentMethodInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await updatePaymentMethod(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      return { ok: false, error: `"${parsed.data.name}" already exists.` };
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function setPaymentMethodActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  try {
    await updatePaymentMethod(id, { active }, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Links (or unlinks) which account this method's money lands in — separate
 * from the main edit form, same one-click pattern as setPaymentMethodActive. */
export async function setPaymentMethodAccount(
  id: string,
  accountId: string | null,
): Promise<ActionResult> {
  const user = await requireUser("manager");
  try {
    await setPaymentMethodAccountStore(id, accountId, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
