"use server";

import { requireUser } from "@/lib/auth";
import { AccountInputSchema } from "@/lib/accounts";
import {
  ensureAccountsIndexes,
  addAccount as addAccountStore,
  editAccount as editAccountStore,
  setAccountActive as setAccountActiveStore,
} from "@/lib/accountsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Owner-only: the opening balance is foundational — every downstream figure
// (the /accounts page, the dashboard strip) is off if it's wrong, closer in
// kind to salary/partner data than to a payment-methods row.

export async function addAccount(input: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");

  const parsed = AccountInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  await ensureAccountsIndexes();
  await addAccountStore(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}

export async function editAccount(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");

  const parsed = AccountInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await editAccountStore(id, parsed.data, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setAccountActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser("owner");
  try {
    await setAccountActiveStore(id, active, { id: user.sub, role: user.role });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
