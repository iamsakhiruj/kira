/**
 * `companyDetails` DB access. Node runtime only; the schema and defaults are in
 * lib/companyDetails.ts. A single document (`_id: "singleton"`) — there is one
 * company. Every write is audit-logged: these values appear on legal documents.
 */

import type { Collection, Document } from "mongodb";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  CompanyDetailsSchema,
  DEFAULT_COMPANY_DETAILS,
  type CompanyDetails,
} from "./companyDetails";

const SINGLETON_ID = "singleton" as unknown as never;

async function collection(): Promise<Collection<Document>> {
  return (await getDb()).collection("companyDetails");
}

/**
 * The company details, or the seeded defaults when nothing has been saved yet.
 * A stored document is parsed through the schema (unknown keys stripped,
 * missing keys defaulted), so a partial/legacy document still reads cleanly.
 */
export async function getCompanyDetails(): Promise<CompanyDetails> {
  const col = await collection();
  const doc = await col.findOne({ _id: SINGLETON_ID });
  if (!doc) return { ...DEFAULT_COMPANY_DETAILS };
  const parsed = CompanyDetailsSchema.safeParse(doc);
  return parsed.success ? parsed.data : { ...DEFAULT_COMPANY_DETAILS };
}

/** Save the company details (owner only, enforced in the action). Upserts the
 * single document and audit-logs the before/after. */
export async function updateCompanyDetails(
  input: CompanyDetails,
  actor: { id: string; role: Role },
): Promise<void> {
  const col = await collection();
  const before = await col.findOne({ _id: SINGLETON_ID });
  await col.updateOne({ _id: SINGLETON_ID }, { $set: { ...input } }, { upsert: true });
  const after = await col.findOne({ _id: SINGLETON_ID });

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: before ? "update" : "create",
    collection: "companyDetails",
    documentId: "singleton",
    before,
    after,
  });
}
