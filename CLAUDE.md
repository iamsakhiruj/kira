# CLAUDE.md — Hotel Bintang KL: Accounts System

Read this before touching any code. `docs/spec.md` holds the full requirements; this file holds the decisions that are already made and the rules that must not be broken.

---

## What we're building

An internal accounts system for a hotel in Kuala Lumpur, running alongside (not replacing) the existing iHotel PMS. Front desk submits a nightly report of money in, rooms sold and cash spent. The owner reviews, approves, and sees the monthly picture.

**Live at:** `account.hotelbintangkl.com`
**Users:** roughly 3–6 people. Two roles. This is a small internal tool, not a SaaS product.

---

## Stack

| | |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Database | MongoDB — already provisioned |
| Validation | Zod at every API boundary, no exceptions |
| Auth | Session-based, two roles: `reception` and `owner` |
| Styling | Tailwind, mobile-first |
| Timezone | `Asia/Kuala_Lumpur` everywhere |

**Driver choice:** use the official `mongodb` driver with Zod schemas rather than Mongoose. We need Zod for API validation anyway, and maintaining two schema definitions of the same thing goes stale.

---

## Non-negotiable rules

### 1. Money is stored as integer sen. Never floats.

`RM 1,234.50` is stored as `123450`. Format only at the display layer. Floating point money bugs are silent, cumulative, and appear months later in a report nobody can reconcile.

Helper functions live in `lib/money.ts`. Every amount in the database is an integer named `...Sen`.

### 2. The business date is computed, never taken from the client

A night report submitted at 01:30 belongs to the previous business day. The cutoff hour is configurable in settings and defaults to 06:00 KL time.

```ts
// lib/businessDate.ts — single source of truth
businessDateFor(instant: Date, cutoffHour: number): string  // "2026-09-01"
```

Never derive a business date from `new Date()` on the client. Never store a business date as a `Date` object — store the `YYYY-MM-DD` string, because it is a calendar label, not an instant.

### 3. Revenue, collections and receivables are three separate things

See spec section 3. A room sold to a monthly guest is revenue today and cash next month. A prepaid OTA booking is revenue today and no cash at the desk at all. Any code that treats "revenue" and "cash received" as the same field is wrong.

### 4. Every write goes to the audit log

Who, when, what collection, what document, before and after. No exceptions, including the owner's own edits. This is a cash-handling system — the log is the point.

### 5. Approved days are immutable

Once the owner approves a business day, it cannot be edited. Corrections are new adjustment entries that reference the original. Never mutate history.

### 6. An advance and a drawing are not expenses

- **Staff advance** — money the employee owes back. A receivable, not a cost.
- **Owner drawing** — a distribution. Reduces cash, never touches profit.

Both reduce cash on hand and must post a cash-out line to that day's night report, or the drawer will not balance. Both must be excluded from the profit calculation. See spec 5.4 and 8.2.

### 7. Reception sees very little

Today and yesterday. Their own entries. No profit figures, no salary figures, no past months, no supplier balances, no drawing history. Enforce this server-side on every query — never by hiding UI elements.

---

## MongoDB notes

**Collections (Phase 1)**

```
users              propertySettings     auditLog
businessDays       employees            advances
ownerTransactions  recurringObligations obligationOccurrences
```

**`businessDays` is one document per day** with embedded arrays. This is the right shape for MongoDB — the whole night report is read and written together, and nothing else references its line items.

```ts
{
  _id, date: "2026-09-01", status: "submitted" | "approved" | "queried",
  rooms: { available, sold, houseUse, revenueSen },
  revenueLines: [{ category, amountSen, note }],
  collections: { cashSen, cardSen, transferSen, ewalletSen,
                 otaPrepaidSen, chargeToAccountSen,
                 depositsSen, refundsSen },
  expenses: [{ category, amountSen, paidTo, receiptUrl, enteredBy }],
  cash: { openingFloatSen, bankedInSen, countedSen, varianceSen, varianceReason },
  remarks,
  submittedBy, submittedAt, approvedBy, approvedAt
}
```

**Unique index on `date`.** Two night reports for the same day is a data corruption bug, not a UI problem. Enforce it in the database.

**Atomicity.** Recording an advance writes to `advances` *and* appends a cash-out line to `businessDays`. If the Mongo deployment is a replica set (Atlas is), use a transaction. If it's a standalone instance, write the advance first with `postedToDayId: null`, then update the day, then set the reference — and add a startup reconciliation check for orphans. Ask me which deployment we have before writing this.

**Indexes to create:** `businessDays.date` (unique), `advances.employeeId`, `auditLog.createdAt`, `obligationOccurrences.dueDate`.

---

## What good looks like here

**The night report is filled in on a phone at 1am by someone who wants to go home.** Every design decision defers to that. Big touch targets, numeric keypad for amounts, sensible defaults, drafts saved locally so a dropped connection doesn't lose the entry. If it takes more than five minutes, the numbers will start being guessed.

**Show the variance prominently.** Expected cash minus counted cash is the number that makes the whole system worth running. Don't bury it.

**Errors say what to do.** "Enter an amount greater than zero", not "Validation failed".

---

## Design system

The full token set lives in `app/globals.css` as CSS variables — that file is the source of truth for values. This section is the source of truth for the *rules*. Components read the variables and utility classes; they never hard-code hex.

**Font wiring (done in Step 1).** The font stack references `var(--font-inter)`, provided by `next/font/google` in `app/layout.tsx`:

```ts
// app/layout.tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--font-inter" });
// inter.variable applied to <html>
```

Don't remove this — without it, non-Apple devices fall back past a missing Inter to Segoe UI / Roboto.

### Typography

One family, system stack — SF Pro on Apple, self-hosted Inter everywhere else. **Do NOT self-host SF Pro; Apple's licence forbids it on the web.** Load Inter weights **400 and 600 only** via `next/font/google` with `display=swap` (self-hosted, no render-blocking request).

Two weights: 400 regular, 600 medium. **Never 700.**

| Role | Size / weight |
|---|---|
| Page title | 22px / 600 |
| Section heading | 17px / 600 |
| Body | 15px / 400 |
| Label | 13px / 400 |
| Caption | 12px / 400 |
| Hero money figure | 34px / 600 mobile, 44px / 600 desktop |

**RULE — every element displaying a money amount** sets `font-variant-numeric: tabular-nums lining` and `text-align: right`. Use the `.money` utility; never re-implement it. Applies to tables, cards, inputs, and totals. No exceptions — without it, columns of amounts don't align.

### Colour

Two invariants, both enforced in `globals.css`:

1. **Orange is interaction, never data** — primary buttons, active nav, focus rings, logo. If a number, chart bar, or badge is orange, that's a bug.
2. **Green means money in, red means money out — nothing else uses them.** Applied *only* through the `.money-in` / `.money-out` utilities. No component references the green/red hex or their vars directly, so the meaning changes in one place if it ever changes.
3. **Never colour alone.** A negative amount gets a minus sign *and* red, so it survives greyscale printing and colour blindness.
4. **Amber (`--warn`) is for attention, not money** — variance out of tolerance, overdue bills, expiring permits.

Palette: brand `--brand/-hover/-tint/-on-brand`; money `--money-in/-bg`, `--money-out/-bg`; warning `--warn/-bg`; neutrals `--text/-muted/-faint`, `--surface`, `--page`, `--border/-strong`.

### Shape and spacing

`--radius` 8px (buttons, inputs), `--radius-card` 12px (cards), `--border-w` 1px. Spacing scale: **4, 8, 12, 16, 24, 32px — nothing between** (`--space-1`…`--space-6`).

Touch targets **min 44px tall** on any reception screen (`--touch-target`). Amount inputs are 44px tall with `inputmode="decimal"` so phones show a number pad. Focus ring: 2px solid `--brand`, 2px offset, on every interactive element — **never remove outlines.**

### Density — two jobs, two densities

- **Reception** — mobile-first, large targets, one column, few elements per screen. Optimised for fast entry at 1am.
- **Owner** — desktop, information-dense, tables and summary cards. Optimised for scanning and spotting problems.

Do not apply reception's spacing to owner screens or vice versa.

### Charts

Horizontal bars, **not pie or donut** — comparing bar lengths is accurate, comparing wedge angles is not, and "which category costs me most" must be answerable at a glance. Always label bars with the actual value; never rely on the axis alone.

---

## Auth (built in Step 2)

Session-based, two roles. Decisions already made — don't relitigate them without reason:

- **Stateless session.** A signed JWT (`jose`, HS256) in an HttpOnly cookie `hbkl_session`, 12h TTL, signed with `SESSION_SECRET` (≥32 chars). **No `sessions` collection** — it isn't in the Phase 1 list and isn't needed at this scale.
- **Passwords.** Argon2id via `@node-rs/argon2` (prebuilt, no native build) in `lib/password.ts`. Node runtime only. Never store or log plaintext.
- **The Edge boundary is load-bearing.** `proxy.ts` (Next 16's renamed middleware) and `lib/session.ts` must stay Edge-safe — `jose` only. **Never import `lib/password.ts`, `lib/mongodb.ts`, or anything Node-native from them**, or the Edge bundle breaks.
- **Two layers, same rule.** `proxy.ts` is the coarse gate (unauthenticated → 302 `/login`; wrong role → 403). `requireUser(role?)` in `lib/auth.ts` is the real guard — called in every protected layout/page/action, and it re-checks the account is still active in the DB. Both share `isAuthorized()` from `lib/session.ts`. Role hierarchy: **owner ≥ reception** (owner can reach reception routes; reception cannot reach owner routes). This is CLAUDE.md rule 7 — enforced server-side, never by hiding UI.
- **Login** is a Server Action (`app/login/actions.ts`) returning one generic "Wrong email or password" for every failure (never reveal whether the email exists). Redirects to the role's home on success.
- **Seeding.** `npm run seed` (tsx, idempotent, audit-logged) creates one owner from `SEED_OWNER_*` env vars. Rotate the seed password after.
- `serverExternalPackages: ["@node-rs/argon2", "mongodb"]` in `next.config.ts` keeps native/heavy packages out of the server bundle.

---

## Night report (built in Step 3)

The core screen (spec §4). Decisions made here:

- **`reconcile()` in `lib/nightReport.ts` is the cash-drawer truth**, unit-tested. Expected = opening float + cash collected − cash expenses − **refunds paid** − banked in. Only `paidBy: "cash"` expenses reduce the drawer; card ones don't. **Cash refunds are treated as leaving the drawer** (a decided extension of spec 4.4 — revisit if refunds are handled differently in practice).
- **Expense lines carry `paidBy: "cash" | "card"`** — added to the CLAUDE.md `businessDays` shape because the drawer math needs it.
- **Variance** is recomputed server-side on submit (never trust the client). A reason is required when `|variance| > varianceThresholdSen` (default RM 20, from settings). Out-of-tolerance shows **amber** — never green/red (those stay reserved for money in/out).
- **Business date is server-decided.** The client may request only the current business date or the previous one (backfilling a missed "yesterday"); the server validates it's one of those two and still missing. One report per day, enforced by the unique index on `businessDays.date`.
- **Drafts live in the browser** (`localStorage`, keyed by date), cleared on submit. A dropped connection at 1am loses nothing. Only Submit writes to the server.
- **`propertySettings`** holds `cutoffHour` and `varianceThresholdSen` (read via `lib/settings.ts`, defaults when absent). No settings UI yet.
- Submit locks the day to `status: "submitted"`. Reception can't edit after; owner review/correction is Step 4.

---

## Conventions

- Server Components by default; Client Components only where there's interaction
- All mutations through Server Actions or route handlers, validated with Zod
- No secrets in the repo. `MONGODB_URI` and session secret in `.env.local`, and `.env*` in `.gitignore` from the first commit
- Passwords hashed with argon2 or bcrypt. Never store or log a plaintext password
- Dates as `YYYY-MM-DD` strings for business dates; real `Date` objects for timestamps
- Tests on `lib/money.ts`, `lib/businessDate.ts`, and the cash reconciliation calculation. Those three carry the arithmetic — everything else is CRUD

---

## Out of scope for now

Don't build these unless asked. They're specified in `docs/spec.md` for later phases:

Guest invoicing · Supplier invoices · Full payroll with EPF/SOCSO/EIS/PCB calculation · MyInvois submission · Bank reconciliation · iHotel integration

Full statutory payroll in particular may never be built here — see spec 8.6.

---

## Compliance context

Malaysian hotel. Relevant later, not in Phase 1, but don't design anything that blocks them:

- LHDN e-Invoice via MyInvois — buyer TIN, SSM number and full address must be capturable on any party record
- SST has no input tax credit — tax paid is part of the cost, never recoverable
- PDPA — guest IC and passport data is sensitive; collect the minimum, restrict access, plan a deletion policy
