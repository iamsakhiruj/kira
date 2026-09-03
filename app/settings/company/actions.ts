"use server";

import { requireUser } from "@/lib/auth";
import { CompanyDetailsSchema } from "@/lib/companyDetails";
import { updateCompanyDetails } from "@/lib/companyDetailsStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Owner only — these values appear on legal documents. Audit-logged in the
 * store. */
export async function saveCompanyDetails(input: unknown): Promise<ActionResult> {
  const user = await requireUser("owner");
  const parsed = CompanyDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  await updateCompanyDetails(parsed.data, { id: user.sub, role: user.role });
  return { ok: true };
}
