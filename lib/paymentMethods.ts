/**
 * `paymentMethods` schema and constants — pure, no database import, safe to
 * import from a client component (the settings screen needs
 * `PAYMENT_METHOD_TYPES` for its type dropdown). DB access lives in
 * `lib/paymentMethodsStore.ts`, same split as `lib/nightReport.ts` (pure)
 * versus `lib/businessDays.ts` (DB) — importing `mongodb` here would pull
 * the whole driver into the browser bundle.
 *
 * One editable list, referenced everywhere money moves (revenue, expenses,
 * partner transactions, salary payments — Phase 2 §3). Not four separate
 * hardcoded enums: add a new e-wallet once, here.
 *
 * Nothing is ever hard-deleted — same philosophy as `employees`' `paused`
 * status (Phase 2 §3). Retiring a method sets `active: false`; anything
 * already recorded against it keeps its reference intact.
 */

import { z } from "zod";

export const PAYMENT_METHOD_TYPES = [
  "cash",
  "bank_transfer",
  "card",
  "ewallet",
  "cheque",
  "other",
] as const;

export const PaymentMethodSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(PAYMENT_METHOD_TYPES),
  active: z.boolean(),
  displayOrder: z.number().int(),
  // Which accounts balance this method's money lands in — e.g. a DuitNow
  // collection lands in the bank balance, a cash collection in the drawer.
  // Nullable: null until linked (Settings > Payment methods), or
  // deliberately left unlinked for an ambiguous type like "other".
  accountId: z.string().nullable().default(null),
});

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** What the client sends to create or edit one. */
export const PaymentMethodInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60),
  type: z.enum(PAYMENT_METHOD_TYPES),
  displayOrder: z.number().int(),
});

export const DEFAULT_PAYMENT_METHODS: Omit<PaymentMethod, "active" | "accountId">[] = [
  { name: "Cash", type: "cash", displayOrder: 0 },
  { name: "Bank transfer", type: "bank_transfer", displayOrder: 1 },
  { name: "DuitNow QR", type: "ewallet", displayOrder: 2 },
  { name: "Card terminal", type: "card", displayOrder: 3 },
  { name: "Touch 'n Go", type: "ewallet", displayOrder: 4 },
  { name: "GrabPay", type: "ewallet", displayOrder: 5 },
  { name: "ShopeePay", type: "ewallet", displayOrder: 6 },
  { name: "Cheque", type: "cheque", displayOrder: 7 },
];
