/**
 * `profitAllocations` DB access. Node runtime only; pure schema and arithmetic
 * are in `lib/profitAllocation.ts`.
 *
 * The freeze rule (build plan §1) is enforced here: a DRAFT allocation may be
 * refreshed (net profit and shares re-pulled), but LOCKING copies the active
 * percentages onto the lines permanently, and a locked allocation is never
 * recomputed and its lines are never re-read from `partnerShares`. Corrections
 * to a locked month are a new adjustment allocation referencing the original.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  ProfitAllocationSchema,
  allocateProfit,
  monthEndDate,
  type ProfitAllocation,
  type AllocationLine,
} from "./profitAllocation";
import { combinedTotalSen } from "./reporting";
import { totalRevenueSen } from "./nightReport";
import { sharesActiveOn } from "./partners";
import { getAllShares, listPartners } from "./partnersStore";
import { getBusinessDaysForMonth } from "./businessDays";
import { getRevenueEntriesForMonth } from "./revenueEntriesStore";
import { getExpensesForMonth } from "./expensesStore";

export type StoredProfitAllocation = WithId<ProfitAllocation>;

async function collection(): Promise<Collection<Document>> {
  return (await getDb()).collection("profitAllocations");
}

/** One base allocation per month (adjustmentOf null); adjustments carry a
 * non-null adjustmentOf and are excluded from the unique index. */
export async function ensureProfitAllocationIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex(
    { month: 1 },
    { unique: true, partialFilterExpression: { adjustmentOf: null } },
  );
}

export interface MonthNetProfit {
  revenueSen: number;
  expenseSen: number;
  netProfitSen: number;
  dayCount: number;
  unapprovedDayCount: number;
}

/**
 * Net profit for a month = revenue − expenses, combining night-report lines
 * with standalone entries that aren't already linked to a night report (the
 * double-counting rule, via the tested combinedTotalSen). Night revenue per
 * day = room revenue + revenue lines; night expense per day = sum of expense
 * lines.
 */
export async function computeMonthNetProfit(month: string): Promise<MonthNetProfit> {
  const [days, revEntries, expEntries] = await Promise.all([
    getBusinessDaysForMonth(month),
    getRevenueEntriesForMonth(month),
    getExpensesForMonth(month),
  ]);

  const nightRevenue = days.map((d) =>
    totalRevenueSen(
      (d.rooms as { revenueSen?: number } | undefined)?.revenueSen ?? 0,
      (d.revenueLines as { amountSen: number }[] | undefined) ?? [],
    ),
  );
  const nightExpense = days.map((d) =>
    ((d.expenses as { amountSen: number }[] | undefined) ?? []).reduce(
      (s, e) => s + e.amountSen,
      0,
    ),
  );

  const revenueSen = combinedTotalSen(
    nightRevenue,
    revEntries.map((e) => ({ amountSen: e.amountSen, linkedBusinessDayId: e.linkedBusinessDayId })),
  );
  const expenseSen = combinedTotalSen(
    nightExpense,
    expEntries.map((e) => ({ amountSen: e.amountSen, linkedBusinessDayId: e.linkedBusinessDayId })),
  );

  return {
    revenueSen,
    expenseSen,
    netProfitSen: revenueSen - expenseSen,
    dayCount: days.length,
    unapprovedDayCount: days.filter((d) => d.status !== "approved").length,
  };
}

/** The active share set as of month-end, as allocation-ready lines with
 * partner names. Throws if no complete set is active then. */
async function frozenSharesForMonth(month: string): Promise<
  { partnerId: string; partnerName: string; percentageBp: number }[]
> {
  const asOf = monthEndDate(month);
  const [shares, partners] = await Promise.all([getAllShares(), listPartners()]);
  const names = new Map(partners.map((p) => [p._id.toString(), p.name]));
  const active = sharesActiveOn(
    shares.map((s) => ({
      partnerId: s.partnerId,
      percentageBp: s.percentageBp,
      effectiveFrom: s.effectiveFrom,
      effectiveTo: s.effectiveTo,
    })),
    asOf,
  );
  if (active.length === 0) {
    throw new Error(
      `No active share set as of ${asOf}. Set partner shares before allocating.`,
    );
  }
  return active.map((s) => ({
    partnerId: s.partnerId,
    partnerName: names.get(s.partnerId) ?? "(unknown)",
    percentageBp: s.percentageBp,
  }));
}

function buildLines(
  netProfitSen: number,
  frozen: { partnerId: string; partnerName: string; percentageBp: number }[],
): AllocationLine[] {
  const allocated = allocateProfit(
    netProfitSen,
    frozen.map((f) => ({ partnerId: f.partnerId, percentageBp: f.percentageBp })),
  );
  const nameById = new Map(frozen.map((f) => [f.partnerId, f.partnerName]));
  return allocated.map((a) => ({
    partnerId: a.partnerId,
    partnerName: nameById.get(a.partnerId) ?? "(unknown)",
    percentageBasisPoints: a.percentageBp,
    amountSen: a.amountSen,
  }));
}

export async function getAllocationsForMonth(
  month: string,
): Promise<StoredProfitAllocation[]> {
  const col = await collection();
  return (await col
    .find({ month })
    .sort({ adjustmentOf: 1, allocatedAt: 1 })
    .toArray()) as StoredProfitAllocation[];
}

export async function getAllocationById(
  id: string,
): Promise<StoredProfitAllocation | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredProfitAllocation | null>;
}

/** All months with an allocation, newest first — for the history list. */
export async function getAllAllocations(): Promise<StoredProfitAllocation[]> {
  const col = await collection();
  return (await col.find({}).sort({ month: -1 }).toArray()) as StoredProfitAllocation[];
}

/**
 * Create or refresh the DRAFT base allocation for a month: recompute net
 * profit and re-freeze the current month-end shares onto fresh lines. Refused
 * once the month's base allocation is locked (use an adjustment instead).
 */
export async function generateOrRefreshDraft(
  month: string,
  actor: { id: string; role: Role },
): Promise<void> {
  const col = await collection();
  const existing = (await col.findOne({
    month,
    adjustmentOf: null,
  })) as StoredProfitAllocation | null;
  if (existing && existing.status === "locked") {
    throw new Error("This month is locked. Create an adjustment to correct it.");
  }

  const profit = await computeMonthNetProfit(month);
  const frozen = await frozenSharesForMonth(month);
  const lines = buildLines(profit.netProfitSen, frozen);

  const doc = ProfitAllocationSchema.parse({
    month,
    netProfitSen: profit.netProfitSen,
    revenueSen: profit.revenueSen,
    expenseSen: profit.expenseSen,
    status: "draft",
    lines,
    adjustmentOf: null,
    allocatedBy: existing?.allocatedBy ?? actor.id,
    allocatedAt: existing?.allocatedAt ?? new Date(),
    lockedBy: null,
    lockedAt: null,
  });

  if (existing) {
    const after = await col.findOneAndUpdate(
      { _id: existing._id, status: "draft" },
      { $set: doc },
      { returnDocument: "after" },
    );
    if (!after) throw new Error("This month was just locked; reload before editing.");
    await recordAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "update",
      collection: "profitAllocations",
      documentId: existing._id.toString(),
      before: existing,
      after,
    });
  } else {
    const res = await col.insertOne(doc);
    await recordAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "create",
      collection: "profitAllocations",
      documentId: res.insertedId.toString(),
      before: null,
      after: doc,
    });
  }
}

/**
 * Lock an allocation. Guarded on status:"draft" so a double-click can't lock
 * twice. After this the lines are permanent — the frozen percentages define
 * the split for that month forever. Returns false if it was already locked.
 */
export async function lockAllocation(
  id: string,
  actor: { id: string; role: Role },
): Promise<boolean> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid allocation id.");
  const col = await collection();
  const _id = new ObjectId(id);
  const before = (await col.findOne({ _id })) as StoredProfitAllocation | null;
  if (!before) throw new Error("That allocation no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id, status: "draft" },
    { $set: { status: "locked", lockedBy: actor.id, lockedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!after) return false;

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "profitAllocations",
    documentId: id,
    before,
    after,
    reason: "allocation locked",
  });
  return true;
}

/**
 * Correct a locked allocation with a new adjustment: a fresh draft, recomputed
 * from current data, referencing the original. The original is never mutated.
 */
export async function createAdjustment(
  originalId: string,
  actor: { id: string; role: Role },
): Promise<string> {
  if (!ObjectId.isValid(originalId)) throw new Error("Invalid allocation id.");
  const col = await collection();
  const original = (await col.findOne({
    _id: new ObjectId(originalId),
  })) as StoredProfitAllocation | null;
  if (!original) throw new Error("That allocation no longer exists.");
  if (original.status !== "locked") {
    throw new Error("Only a locked allocation needs an adjustment — edit the draft instead.");
  }

  const profit = await computeMonthNetProfit(original.month);
  const frozen = await frozenSharesForMonth(original.month);
  const lines = buildLines(profit.netProfitSen, frozen);

  const doc = ProfitAllocationSchema.parse({
    month: original.month,
    netProfitSen: profit.netProfitSen,
    revenueSen: profit.revenueSen,
    expenseSen: profit.expenseSen,
    status: "draft",
    lines,
    adjustmentOf: originalId,
    allocatedBy: actor.id,
    allocatedAt: new Date(),
    lockedBy: null,
    lockedAt: null,
  });

  const res = await col.insertOne(doc);
  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "correct",
    collection: "profitAllocations",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
    reason: `adjustment of ${originalId}`,
  });
  return res.insertedId.toString();
}
