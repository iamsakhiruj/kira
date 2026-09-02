/**
 * `accounts` DB access, plus the aggregation that pulls movements from the
 * six money sources for `lib/accounts.ts`'s `buildAccountMovements()`. Node
 * runtime only — see `lib/accounts.ts` for why the schema/calculation lives
 * in a separate, pure file.
 */

import { ObjectId, type Collection, type Document, type WithId } from "mongodb";
import { z } from "zod";
import { getDb } from "./mongodb";
import { recordAudit } from "./audit";
import type { Role } from "./session";
import {
  type Account,
  type AccountInputSchema,
  type AccountType,
  type AccountMovement,
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNTS,
  buildAccountMovements,
} from "./accounts";
import { PAYMENT_METHOD_TYPES } from "./paymentMethods";
import { getPaymentMethods } from "./paymentMethodsStore";
import { getBusinessDaysBetween } from "./businessDays";
import { getExpensesBetween } from "./expensesStore";
import { getRevenueEntriesBetween } from "./revenueEntriesStore";
import { getPartnerTransactionsBetween, listPartners } from "./partnersStore";
import { getSalaryPaymentsPaidBetween } from "./salaryStore";
import { getOtaRemittancesBetween } from "./otaRemittancesStore";
import { getAllCategories } from "./categoriesStore";
import { getOtaPlatforms } from "./otaPlatformsStore";

export type StoredAccount = WithId<Account>;

async function collection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection("accounts");
}

export async function ensureAccountsIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ active: 1, displayOrder: 1 });
}

/** Which account type a payment-method type obviously belongs to — the
 * "obvious mapping" the backfill below applies. `null` = genuinely
 * ambiguous (only "other"); left for the owner to link by hand. */
const PAYMENT_METHOD_TYPE_TO_ACCOUNT_TYPE: Record<
  (typeof PAYMENT_METHOD_TYPES)[number],
  AccountType | null
> = {
  cash: "cash",
  bank_transfer: "bank",
  card: "bank",
  cheque: "bank",
  ewallet: "ewallet",
  other: null,
};

/**
 * Idempotent, safe to call on every page load (like every other
 * `ensure*Seeded`): seeds the three default accounts only if the collection
 * is empty, then backfills any payment method whose `accountId` is still
 * unset (Mongo's `{ accountId: null }` matches both `null` and a missing
 * field) by the obvious type mapping above. Never overwrites a link that's
 * already been set.
 */
export async function ensureAccountsSeeded(todayBusinessDate: string): Promise<void> {
  const col = await collection();
  const count = await col.estimatedDocumentCount();
  if (count === 0) {
    await col.insertMany(
      DEFAULT_ACCOUNTS.map((a) => ({
        ...a,
        openingBalanceSen: 0,
        openingDate: todayBusinessDate,
        active: true,
      })),
    );
  }
  await backfillPaymentMethodAccountLinks();
}

async function backfillPaymentMethodAccountLinks(): Promise<void> {
  const accounts = await getAccounts();
  const pmCol = (await getDb()).collection("paymentMethods");

  for (const type of ACCOUNT_TYPES) {
    const candidates = accounts.filter((a) => a.type === type).sort((a, b) => a.displayOrder - b.displayOrder);
    const accountId = candidates[0]?._id.toString();
    if (!accountId) continue;

    const paymentMethodTypes = (Object.keys(PAYMENT_METHOD_TYPE_TO_ACCOUNT_TYPE) as (typeof PAYMENT_METHOD_TYPES)[number][])
      .filter((pmType) => PAYMENT_METHOD_TYPE_TO_ACCOUNT_TYPE[pmType] === type);
    if (paymentMethodTypes.length === 0) continue;

    await pmCol.updateMany(
      { type: { $in: paymentMethodTypes }, accountId: null },
      { $set: { accountId } },
    );
  }
}

/** Active accounts, sorted for display and for the "first active by
 * displayOrder" resolution rule. */
export async function getAccounts(): Promise<StoredAccount[]> {
  const col = await collection();
  const docs = await col.find({ active: true }).sort({ displayOrder: 1 }).toArray();
  return docs as StoredAccount[];
}

/** All accounts, including inactive — the management page. */
export async function getAllAccounts(): Promise<StoredAccount[]> {
  const col = await collection();
  const docs = await col.find({}).sort({ displayOrder: 1 }).toArray();
  return docs as StoredAccount[];
}

export async function getAccount(id: string): Promise<StoredAccount | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  return col.findOne({ _id: new ObjectId(id) }) as Promise<StoredAccount | null>;
}

export async function addAccount(
  input: z.infer<typeof AccountInputSchema>,
  actor: { id: string; role: Role },
): Promise<string> {
  const doc: Account = { ...input, active: true };
  const col = await collection();
  const res = await col.insertOne(doc);

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "create",
    collection: "accounts",
    documentId: res.insertedId.toString(),
    before: null,
    after: doc,
  });

  return res.insertedId.toString();
}

export async function editAccount(
  id: string,
  changes: Partial<z.infer<typeof AccountInputSchema>> & { active?: boolean },
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid account id.");
  const col = await collection();
  const _id = new ObjectId(id);

  const before = await col.findOne({ _id });
  if (!before) throw new Error("That account no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id },
    { $set: changes },
    { returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "accounts",
    documentId: id,
    before,
    after,
  });
}

export async function setAccountActive(
  id: string,
  active: boolean,
  actor: { id: string; role: Role },
): Promise<void> {
  await editAccount(id, { active }, actor);
}

/** Link (or unlink) one payment method to an account. A separate action from
 * the payment method's own name/type/order edit — this is operational
 * plumbing, editable independently. */
export async function setPaymentMethodAccount(
  id: string,
  accountId: string | null,
  actor: { id: string; role: Role },
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid payment method id.");
  const col = (await getDb()).collection("paymentMethods");
  const _id = new ObjectId(id);

  const before = await col.findOne({ _id });
  if (!before) throw new Error("That payment method no longer exists.");

  const after = await col.findOneAndUpdate(
    { _id },
    { $set: { accountId } },
    { returnDocument: "after" },
  );

  await recordAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "update",
    collection: "paymentMethods",
    documentId: id,
    before,
    after,
  });
}

// --- Movement aggregation ---------------------------------------------------

export interface AccountMovementsData {
  accounts: StoredAccount[];
  movements: AccountMovement[];
  unattributedSen: number;
}

/**
 * Everything the /accounts page and the dashboard's compact strip need: the
 * active accounts, and every movement against them from `historyFromDate`
 * (the earliest active account's own `openingDate` — a period's "opening
 * balance" needs full history, not just the requested range) through `to`.
 * `summarizeAccountPeriod()` (lib/accounts.ts) then slices per account and
 * per requested period from this one shared movement set.
 */
export async function getAccountMovementsData(
  toDate: string,
  { includePartnerMovement }: { includePartnerMovement: boolean },
): Promise<AccountMovementsData> {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    return { accounts, movements: [], unattributedSen: 0 };
  }
  const historyFromDate = accounts.reduce(
    (min, a) => (a.openingDate < min ? a.openingDate : min),
    accounts[0].openingDate,
  );

  const [
    paymentMethods,
    nightReportDocs,
    expenseDocs,
    revenueDocs,
    salaryDocs,
    otaRemittanceDocs,
    partnerTxnDocs,
    expenseCategories,
    revenueCategories,
    partners,
    otaPlatforms,
  ] = await Promise.all([
    getPaymentMethods(),
    getBusinessDaysBetween(historyFromDate, toDate),
    getExpensesBetween(historyFromDate, toDate),
    getRevenueEntriesBetween(historyFromDate, toDate),
    getSalaryPaymentsPaidBetween(historyFromDate, toDate),
    getOtaRemittancesBetween(historyFromDate, toDate),
    includePartnerMovement
      ? getPartnerTransactionsBetween(historyFromDate, toDate)
      : Promise.resolve([]),
    getAllCategories("expense"),
    getAllCategories("revenue"),
    includePartnerMovement ? listPartners() : Promise.resolve([]),
    getOtaPlatforms(),
  ]);

  const accountIdByPaymentMethod = new Map<string, string | null>(
    paymentMethods.map((m) => [m._id.toString(), m.accountId ?? null]),
  );
  const categoryNameById = new Map(
    [...expenseCategories, ...revenueCategories].map((c) => [c._id.toString(), c.name]),
  );
  const partnerNameById = new Map(partners.map((p) => [p._id.toString(), p.name]));
  const platformNameById = new Map(otaPlatforms.map((p) => [p._id.toString(), p.name]));

  type NightReportRaw = {
    date: string;
    varianceSen?: number;
    collections?: {
      cashSen?: number;
      cardSen?: number;
      transferSen?: number;
      ewalletSen?: number;
      refundsSen?: number;
    };
    cash?: { bankedInSen?: number };
    expenses?: { amountSen: number; paidBy: "cash" | "card" }[];
  };

  const { movements, unattributedSen } = buildAccountMovements({
    accounts: accounts.map((a) => ({
      id: a._id.toString(),
      type: a.type,
      active: a.active,
      displayOrder: a.displayOrder,
    })),
    accountIdByPaymentMethod,
    nightReports: (nightReportDocs as unknown as NightReportRaw[]).map((d) => ({
      date: String(d.date),
      varianceSen: typeof d.varianceSen === "number" ? d.varianceSen : undefined,
      collections: {
        cashSen: d.collections?.cashSen ?? 0,
        cardSen: d.collections?.cardSen ?? 0,
        transferSen: d.collections?.transferSen ?? 0,
        ewalletSen: d.collections?.ewalletSen ?? 0,
        refundsSen: d.collections?.refundsSen ?? 0,
      },
      cash: { bankedInSen: d.cash?.bankedInSen ?? 0 },
      expenses: d.expenses ?? [],
    })),
    expenses: expenseDocs.map((e) => ({
      date: e.date,
      amountSen: e.amountSen,
      paymentMethodId: e.paymentMethodId,
      label: `Expense — ${categoryNameById.get(e.categoryId) ?? "Uncategorised"}`,
    })),
    revenueEntries: revenueDocs.map((r) => ({
      date: r.date,
      amountSen: r.amountSen,
      paymentMethodId: r.paymentMethodId,
      label: `Revenue — ${categoryNameById.get(r.categoryId) ?? "Uncategorised"}`,
    })),
    salaryPaymentsPaid: salaryDocs.map((s) => ({
      date: s.paidDate ?? s.month,
      amountSen: s.netSen,
      paymentMethodId: s.paymentMethodId,
      label: `Salary — ${s.employeeName} (${s.month})`,
    })),
    partnerDrawings: includePartnerMovement
      ? partnerTxnDocs
          .filter((t) => t.direction === "drawing")
          .map((t) => ({
            date: t.date,
            amountSen: t.amountSen,
            paymentMethodId: t.paymentMethodId,
            label: `Partner drawing — ${partnerNameById.get(t.partnerId) ?? "Unknown"}`,
          }))
      : [],
    partnerInjections: includePartnerMovement
      ? partnerTxnDocs
          .filter((t) => t.direction === "injection")
          .map((t) => ({
            date: t.date,
            amountSen: t.amountSen,
            paymentMethodId: t.paymentMethodId,
            label: `Partner injection — ${partnerNameById.get(t.partnerId) ?? "Unknown"}`,
          }))
      : [],
    otaRemittances: otaRemittanceDocs.map((o) => ({
      date: o.date,
      amountSen: o.amountReceivedSen,
      paymentMethodId: o.paymentMethodId,
      label: `OTA remittance — ${platformNameById.get(o.platformId) ?? "Unknown"}`,
    })),
  });

  return { accounts, movements, unattributedSen };
}
