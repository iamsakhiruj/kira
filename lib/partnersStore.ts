/**
 * Partners DB access — `partners`, `partnerShares`, `partnerTransactions`.
 * Node runtime only; the pure schemas and arithmetic are in `lib/partners.ts`.
 *
 * Share changes never edit history: setShares() closes the open rows and opens
 * new ones (see §1). The writes are ordered close-then-insert; this is not
 * wrapped in a Mongo transaction (consistent with the rest of the codebase —
 * the deployment-specific transaction question in CLAUDE.md's MongoDB notes is
 * unanswered), so a mid-operation failure leaves no current set rather than an
 * overlap, which is visible and repaired by re-running the change.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb, getMongoClient } from "./mongodb";
import type { AuditInput } from "./audit";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  type Partner,
  type PartnerShare,
  type PartnerTransaction,
  type PartnerInputSchema,
  type PartnerTransactionInputSchema,
  type ShareLine,
  validateShareSet,
  summariseTransactions,
  computePartnerBalanceSen,
} from "./partners";

export type StoredPartner = WithId<Partner>;
export type StoredPartnerShare = WithId<PartnerShare>;
export type StoredPartnerTransaction = WithId<PartnerTransaction>;

async function partnersCol(): Promise<Collection<Document>> {
  return (await getDb()).collection("partners");
}
async function sharesCol(): Promise<Collection<Document>> {
  return (await getDb()).collection("partnerShares");
}
async function txnsCol(): Promise<Collection<Document>> {
  return (await getDb()).collection("partnerTransactions");
}

export async function ensurePartnerIndexes(): Promise<void> {
  const [shares, txns] = await Promise.all([sharesCol(), txnsCol()]);
  await Promise.all([
    shares.createIndex({ partnerId: 1, effectiveFrom: 1 }),
    txns.createIndex({ partnerId: 1, date: -1 }),
  ]);
}

// --- partners -------------------------------------------------------------

export async function listPartners(): Promise<StoredPartner[]> {
  const col = await partnersCol();
  return (await col.find({}).sort({ name: 1 }).toArray()) as StoredPartner[];
}

export async function getPartner(id: string): Promise<StoredPartner | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await partnersCol();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredPartner | null>;
}

export async function createPartner(
  input: z.infer<typeof PartnerInputSchema>,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: Partner = { ...input };
  const col = await partnersCol();
  const res = await col.insertOne(doc);
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "partners",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });
  return res.insertedId.toString();
}

export async function updatePartner(
  id: string,
  changes: Partial<z.infer<typeof PartnerInputSchema>>,
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid partner id.");
  const col = await partnersCol();
  const _id = new ObjectId(id);
  const before = await col.findOne({ _id });
  if (!before) throw new Error("That partner no longer exists.");
  const after = await col.findOneAndUpdate(
    { _id },
    { $set: changes },
    { returnDocument: "after" },
  );
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "partners",
    documentId: id,
    before,
    after,
  });
}

// --- shares ---------------------------------------------------------------

export async function getAllShares(): Promise<StoredPartnerShare[]> {
  const col = await sharesCol();
  return (await col
    .find({})
    .sort({ effectiveFrom: -1 })
    .toArray()) as StoredPartnerShare[];
}

/**
 * Set a new active share set effective from a date. Validates the set totals
 * 100%, closes every currently-open row (effectiveTo = effectiveFrom) and
 * inserts the new rows. History is never mutated — an old percentage stays on
 * its own row, now bounded.
 *
 * The close and the inserts run inside a single Mongo transaction (Atlas is a
 * three-node replica set, so transactions are available). This removes the
 * window the close-then-insert ordering would otherwise leave, in which the
 * app has no valid current share set until someone notices and re-runs it —
 * either the whole change commits or nothing does. Audit entries are written
 * after commit, so the log reflects exactly what landed and a rolled-back
 * attempt leaves no trace.
 */
export async function setShares(
  effectiveFrom: string,
  lines: ShareLine[],
  actor: { id: string; role: Role },
): Promise<void> {
  const check = validateShareSet(lines);
  if (!check.ok) throw new Error(check.error ?? "Invalid share set.");

  // Every referenced partner must exist and be active — you don't allocate a
  // share to someone who isn't a current owner.
  const partners = await listPartners();
  const byId = new Map(partners.map((p) => [p._id.toString(), p]));
  for (const line of lines) {
    const p = byId.get(line.partnerId);
    if (!p) throw new Error("A share references a partner that no longer exists.");
    if (!p.active) throw new Error(`${p.name} has exited and can't hold a share.`);
  }

  const col = await sharesCol();
  const client = await getMongoClient();
  const session = client.startSession();
  // Collected inside the transaction, written to the audit log only after it
  // commits (recordAudit isn't session-aware, and an aborted change must not
  // leave audit entries).
  const auditOps: AuditInput[] = [];

  try {
    await session.withTransaction(async () => {
      // Reset in case withTransaction retries the callback on a transient error.
      auditOps.length = 0;

      const open = (await col
        .find({ effectiveTo: null }, { session })
        .toArray()) as StoredPartnerShare[];

      // The new set must start strictly after the current one, or the old rows
      // would collapse to an empty interval and their history would vanish.
      for (const row of open) {
        if (effectiveFrom <= row.effectiveFrom) {
          throw new Error(
            `New shares must take effect after the current set (from ${row.effectiveFrom}).`,
          );
        }
      }

      // Close the open rows.
      for (const row of open) {
        const after = await col.findOneAndUpdate(
          { _id: row._id },
          { $set: { effectiveTo: effectiveFrom } },
          { returnDocument: "after", session },
        );
        auditOps.push({
          actorId: actor.id,
          actorRole: actor.role,
          action: "update",
          collection: "partnerShares",
          documentId: row._id.toString(),
          before: row,
          after,
          reason: "share set superseded",
        });
      }

      // Open the new rows.
      for (const line of lines) {
        const doc: PartnerShare = {
          partnerId: line.partnerId,
          percentageBp: line.percentageBp,
          effectiveFrom,
          effectiveTo: null,
          setBy: actor.id,
          setAt: new Date(),
        };
        const res = await col.insertOne(doc, { session });
        auditOps.push({
          actorId: actor.id,
          actorRole: actor.role,
          action: "create",
          collection: "partnerShares",
          documentId: res.insertedId.toString(),
          before: null,
          after: doc,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  for (const op of auditOps) await recordAudit(op);
}

// --- transactions ---------------------------------------------------------

const RECENT_TXN_LIMIT = 200;

export async function getRecentTransactions(
  limit: number = RECENT_TXN_LIMIT,
): Promise<StoredPartnerTransaction[]> {
  const col = await txnsCol();
  return (await col
    .find({})
    .sort({ date: -1 })
    .limit(limit)
    .toArray()) as StoredPartnerTransaction[];
}

export async function recordTransaction(
  input: z.infer<typeof PartnerTransactionInputSchema>,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: PartnerTransaction = {
    ...input,
    recordedBy: actor.id,
    recordedAt: new Date(),
  };
  const col = await txnsCol();
  const res = await col.insertOne(doc);
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "partnerTransactions",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });
  return res.insertedId.toString();
}

// --- balances -------------------------------------------------------------

export interface PartnerBalance {
  allocatedSen: number;
  injectionsSen: number;
  drawingsSen: number;
  balanceSen: number;
  /** Total drawn with purpose "director_loan" — Section 140B exposure. */
  directorLoanSen: number;
}

/**
 * Balance per partner id: allocated + injections − drawings. Allocation is 0
 * until profit allocation exists (Step 2.7) — the slot is here so 2.7 drops
 * in. Also surfaces the director-loan total for the §2 / s.140B flag.
 */
export async function getPartnerBalances(): Promise<Map<string, PartnerBalance>> {
  const col = await txnsCol();
  const txns = (await col.find({}).toArray()) as StoredPartnerTransaction[];

  const byPartner = new Map<string, StoredPartnerTransaction[]>();
  for (const t of txns) {
    const list = byPartner.get(t.partnerId) ?? [];
    list.push(t);
    byPartner.set(t.partnerId, list);
  }

  const balances = new Map<string, PartnerBalance>();
  for (const [partnerId, list] of byPartner) {
    const { injectionsSen, drawingsSen } = summariseTransactions(list);
    const allocatedSen = 0; // Step 2.7
    const directorLoanSen = list
      .filter((t) => t.direction === "drawing" && t.purpose === "director_loan")
      .reduce((s, t) => s + t.amountSen, 0);
    balances.set(partnerId, {
      allocatedSen,
      injectionsSen,
      drawingsSen,
      balanceSen: computePartnerBalanceSen({ allocatedSen, injectionsSen, drawingsSen }),
      directorLoanSen,
    });
  }
  return balances;
}
