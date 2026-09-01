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

### 7. Reception sees very little; manager runs operations, not money; owner is not restricted

Three roles now (Phase 2 §4/old §3 added `manager` between reception and owner).

**Reception:** today and yesterday (plus backdating within the 7-day window — see Night report below). Their own entries. No profit figures, no salary figures, no past months, no supplier balances, no drawing history.

**Manager:** day-to-day operations — approve a day, apply a correction, expenses, revenue entries, attendance, advances, employee list (names and positions only, not pay). **Explicitly not:** salaries and payroll, partners/shares/drawings, profit and allocations, manage users. A manager who can see revenue entries and expenses can already estimate profit — that's accepted (Phase 2 §4/old §3 open question), but salary and partner figures stay owner-only regardless.

**Owner:** unrestricted, including on reception's own screens — **in a small hotel the owner covers shifts**, so they can reach `/reception/*` and submit night reports like any reception user.

Enforce all of this server-side on every query — never by hiding UI elements.

**Role hierarchy: owner ≥ manager ≥ reception.** `isAuthorized()` in `lib/session.ts` implements this as a rank comparison (`RANK[role] >= RANK[required]`), checked identically by `proxy.ts` (the coarse Edge gate, a flat list of `{prefix, required}` entries — see the file, order-independent as long as no prefix nests inside another) and `requireUser()` (the real one) — see the Auth section below. Manager being a rank strictly between the other two means "not reception" is no longer the same test as "owner" — a route or query gated at `owner` really does exclude manager, not just reception.

**One route, one gate.** When a feature has a part only the owner should reach (e.g. Settings' payment methods vs. users), that's two separately-gated routes (`/settings/payment-methods`, `/settings/users`), not one route gated at the lower tier with the sensitive part hidden inside. A manager-gated parent route with an owner-only section hidden in its UI would still be reachable by URL.

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
                 depositsSen, refundsSen, receivablesSettledSen },
  expenses: [{ category, amountSen, paidTo, receiptUrl, enteredBy }],
  cash: { openingFloatSen, bankedInSen, countedSen, varianceSen, varianceReason },
  revenueGapSen, revenueGapReason,
  enteredLate, enteredLateReason,
  remarks,
  submittedBy, submittedAt, approvedBy, approvedAt
}
```

**Unique index on `date`.** Two night reports for the same day is a data corruption bug, not a UI problem. Enforce it in the database.

**Atomicity.** Recording an advance writes to `advances` *and* appends a cash-out line to `businessDays`. If the Mongo deployment is a replica set (Atlas is), use a transaction. If it's a standalone instance, write the advance first with `postedToDayId: null`, then update the day, then set the reference — and add a startup reconciliation check for orphans. Ask me which deployment we have before writing this.

**Indexes to create:** `businessDays.date` (unique), `advances.employeeId`, `auditLog.createdAt`, `obligationOccurrences.dueDate`.

**Local dev network blocks SRV DNS.** On this machine's network, Node's DNS resolver can't complete the `_mongodb._tcp.*` SRV lookup that `mongodb+srv://` requires (fails with `ECONNREFUSED`), even though Windows `nslookup` resolves the same SRV record fine — it's Node's resolver specifically being refused, not a real DNS/Atlas problem. `MONGODB_URI` in `.env.local` therefore uses the standard non-SRV `mongodb://` form with the three shard hosts and `replicaSet`/`ssl`/`authSource` spelled out explicitly, copied from Atlas Connect's "standard connection string" option. **Do not "simplify" this back to the short `mongodb+srv://` form without testing** — it will likely work fine on a different network, or on the deploy server (Step 9), where this resolver restriction may not apply.

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

Session-based, three roles (reception, manager, owner — manager added in Phase 2 step 2.1). Decisions already made — don't relitigate them without reason:

- **Stateless session.** A signed JWT (`jose`, HS256) in an HttpOnly cookie `hbkl_session`, 12h TTL, signed with `SESSION_SECRET` (≥32 chars). **No `sessions` collection** — it isn't in the Phase 1 list and isn't needed at this scale.
- **Passwords.** Argon2id via `@node-rs/argon2` (prebuilt, no native build) in `lib/password.ts`. Node runtime only. Never store or log plaintext.
- **The Edge boundary is load-bearing.** `proxy.ts` (Next 16's renamed middleware) and `lib/session.ts` must stay Edge-safe — `jose` only. **Never import `lib/password.ts`, `lib/mongodb.ts`, or anything Node-native from them**, or the Edge bundle breaks.
- **Two layers, same rule.** `proxy.ts` is the coarse gate (unauthenticated → 302 `/login`; wrong role → 403) — a flat `{prefix, required?}` list, one entry per gated route prefix, `required` omitted meaning any authenticated role. `requireUser(role?)` in `lib/auth.ts` is the real guard — called in every protected layout/page/action, and it re-checks the account is still active in the DB. Both share `isAuthorized()` from `lib/session.ts`. Role hierarchy: **owner ≥ manager ≥ reception**. This is CLAUDE.md rule 7 — enforced server-side, never by hiding UI. Keep `proxy.ts`'s list and each route's own `requireUser()` call in agreement — they're checked independently and both have to be right.
- **Login** is a Server Action (`app/login/actions.ts`) returning one generic "Wrong email or password" for every failure (never reveal whether the email exists). Redirects to the role's home on success.
- **Seeding.** `npm run seed` (tsx, idempotent, audit-logged) creates one owner from `SEED_OWNER_*` env vars. Rotate the seed password after.
- `serverExternalPackages: ["@node-rs/argon2", "mongodb"]` in `next.config.ts` keeps native/heavy packages out of the server bundle.

---

## Night report (built in Step 3)

The core screen (spec §4). Decisions made here:

- **`reconcile()` in `lib/nightReport.ts` is the cash-drawer truth**, unit-tested. Expected = opening float + cash collected − cash expenses − **refunds paid** − banked in. Only `paidBy: "cash"` expenses reduce the drawer; card ones don't. **Cash refunds are treated as leaving the drawer** (a decided extension of spec 4.4 — revisit if refunds are handled differently in practice).
- **Expense lines carry `paidBy: "cash" | "card"`** — added to the CLAUDE.md `businessDays` shape because the drawer math needs it.
- **Variance** is recomputed server-side on submit (never trust the client). A reason is required when `|variance| > varianceThresholdSen` (default RM 20, from settings). Out-of-tolerance shows **amber** — never green/red (those stay reserved for money in/out).
- **Business date is server-decided, but is no longer limited to today/yesterday** (superseded — see "Backdating" below). The server still validates every submitted date against the caller's role via `canSubmitDate()`; the client's requested date is only ever a request. One report per day, enforced by the unique index on `businessDays.date`.
- **Drafts live in the browser** (`localStorage`, keyed by date), cleared on submit. A dropped connection at 1am loses nothing. Only Submit writes to the server.
- **`propertySettings`** holds `cutoffHour`, `varianceThresholdSen`, `revenueGapThresholdSen`, and `expenseCeilingSen` (read via `lib/settings.ts`, defaults when absent). No settings UI yet.
- Submit locks the day to `status: "submitted"`. Reception can't edit after; owner approves in Step 4 (below) — correction/editing an approved day is still unbuilt.
- **`revenueGap()` in `lib/nightReport.ts` checks the spec §3 identity** (revenue = collections + receivables added − receivables settled) and is a **warning, never a block** — reception must always be able to submit, or a refusal at 1am just gets fudged until it passes. Deposits are excluded from the identity entirely (money in, not revenue — netting them in would cause false gaps on deposit-taking nights). `receivablesSettledSen` was added to `collections`: money collected today (already inside cash/card/transfer/ewallet) that pays off a receivable booked on an earlier day, e.g. a monthly guest clearing last month's `chargeToAccount` balance. Same UX pattern as the cash variance: shown above submit, reason required past `revenueGapThresholdSen` (default RM 50), `revenueGapSen`/`revenueGapReason` stored on the document for the Step 4 owner queue to surface.
- **§4.6 kitchen purchases** uses spec's Option A: a plain expense line (category "Kitchen purchases") through petty cash, not a float with top-ups. Simplest, right for now since reception hands over the cash each morning; revisit if that assumption stops holding.
- **Amounts are validated as non-negative on both sides.** `MoneyInput` in the form amber-highlights a negative value the same way it does an unparseable one — `toSen()` accepts a leading `-`, so this can't be caught by "does it parse."
- **Per-item expense ceiling (spec §4.5)** is `expenseCeilingSen` in settings, default RM 300 — spec §14 open question 5 asks the owner directly what this number should be and hasn't been answered yet, so treat RM 300 as a placeholder to revisit once they do. "Needs the owner, not reception" is implemented the same warn-not-block way as variance and the revenue gap: an expense line over the ceiling requires its (now-visible) `note` field to be filled before submit, checked both client- and server-side. It doesn't block the report — it ensures the note the owner will need is captured at the point reception actually remembers why, ready for the owner review queue (below) to show.
- **`ExpenseLineSchema` carries `receiptUrl` (optional, string)**, matching the shape above. No upload mechanism exists yet — file storage for receipt/report photos (spec §4.1, §4.5) isn't decided (no bucket, no env vars, nothing in the Stack table) — this field just keeps the schema from drifting further from the documented shape until that decision is made.
- **Backdating.** A missed night report used to have no way back in — reception could only submit today or yesterday, silently breaking monthly totals whenever a day got missed. Now: reception may submit any of the last 7 business dates (today plus the 6 before it — `canSubmitDate()` in `lib/businessDate.ts`, `backfillDays` defaults to 7, hardcoded not settings-driven since the spec gave a fixed number); the owner has no lower limit, just no future dates for anyone. Enforced server-side in `submitNightReport()` — the date picker's `min`/`max` are a UI hint only.
- **A date other than today's business date sets `enteredLate: true` plus a required `enteredLateReason`** (one line — power cut, sick shift, forgotten — CLAUDE.md rule: "written three days later is less reliable than written at 1am"). Independent of role: an owner backfilling a missed day is still `enteredLate`. `submittedAt` already carries the real entry instant — no separate timestamp field was added. Shown as a "Backdated" badge in the owner review queue (both tables).
- **`app/reception/page.tsx` lists all 7 days, not just two.** Missing days beyond today/yesterday get the exact prompt copy "No report for `<Thu 3 Sep>` — add it", entirely server-computed (`formatBusinessDateLabel()` — a fixed weekday/month lookup table, not `Intl.DateTimeFormat`, because ICU's short month for en-GB/en-MY is "Sept" not "Sep" on this runtime and that drift would silently break the copy). The client never touches a date computation, per this feature's own requirement — even `DaySlot.isRecent` (which choice of copy/layout to use) is a boolean computed server-side, not inferred from a client-side date comparison.
- **Switching dates on the form must never lose the entry being left — a data-loss bug here would be worse than the missing-backdate bug this replaces.** The save/load logic is pulled out of the component into `lib/draftStorage.ts`'s `switchDraftDate()` (dependency-injected storage, same pattern as `lib/mongoDns.ts`), so it's unit-tested without a DOM: outgoing state is always persisted under its own key before the incoming date's draft loads, verified directly (`lib/draftStorage.test.ts`), including a round-trip test and failure-mode tests (storage full, corrupt draft). The form additionally warns (`window.confirm`) before switching away from a dirty, in-progress entry — reassurance that the entry is safe, not a hard block.

## Owner review (started in Step 4, moved onto Front desk in Phase 2 §2.2)

Minimal on purpose — just enough to make self-approval visible, not the full review/correction screen spec §5 describes.

- **`app/reception/approval-queue.tsx`** (moved from `app/owner/page.tsx` — see Sidebar and shell below) lists submitted days awaiting approval (revenue, variance, revenue gap — amber past the same thresholds as the reception form) and the most recent approved days. `approveNightReport()` in `app/reception/approve-actions.ts` sets `status: "approved"`, `approvedBy`, `approvedAt`; audit-logged with the full before/after document, same as submit. Gated `requireUser("manager")` — Phase 2 §4 makes "Approve a day" a manager permission, not owner-only.
- **`approveBusinessDay()` in `lib/businessDays.ts` guards its own filter on `status: "submitted"`** — a double-click or two people approving at once can't approve the same day twice; the second write simply matches nothing and the action reports it was already handled.
- **Self-approval is allowed, not blocked.** A small hotel's owner (or now manager) covers shifts, so `submittedBy === approvedBy` is a normal case, not an error. `isSelfApproved()` in `lib/nightReport.ts` flags it; the "Recently approved" table shows a "Self-approved" badge (amber, per the colour rule — attention, not money) when it applies. Both tables also show a "Backdated" badge when `enteredLate` is set (see the Backdating bullet above) — a report written days later than the business date it covers is a fact the reviewer should see at review time, not just something quietly logged.
- **Not built yet:** editing or querying an approved day (still immutable per rule 5), the profit/monthly picture from spec §5, and anything using `receiptUrl`/`reportPhotoUrl` beyond storing the pasted link.

---

## Sidebar and shell (Phase 2 §2.2)

- **One shared shell, existing URLs kept.** `components/app-shell.tsx` (sidebar + header, role-filtered nav via `isAuthorized()`) is rendered by every protected route's own `layout.tsx` — this is not a route-group restructure. `/reception` and `/owner` kept their paths rather than moving to match the sidebar's naming (e.g. `/front-desk`) literally; the nav label can say "Front desk" while linking to `/reception`. Chosen over a literal rename to avoid re-touching the reception flow's routing (drafts, date picker, validation) for a naming match with no functional difference.
- **Front desk is one role-aware page, not a separate approvals destination.** Phase 2 §5's sidebar has no "approvals" nav item — `/reception`'s guard relaxed from `requireUser("reception")` to `requireUser()` (any role), and the page (`app/reception/page.tsx`) conditionally renders `<ApprovalQueue>` when `role !== "reception"`. `/owner` is retired to an owner-gated redirect to `/reception` (kept rather than deleted, in case anything still links there).
- **Settings is two routes, not one gated at the lower tier.** `/settings/payment-methods` (manager+) and `/settings/users` (owner-only, stub) each have their own `layout.tsx` guard. The shell's nav renders them as a "Settings" group with two links, since there's no single `/settings` landing route to point at — see rule 7's "one route, one gate."
- **Sidebar nav badge is real data** (`getPendingBusinessDays().length` on the Front desk item), fetched inside `AppShell` for manager/owner only. **Dashboard numbers that don't exist yet show muted "No data yet" text** (`app/dashboard/page.tsx`), never a placeholder figure or a bare em dash (an em dash reads as a rendering failure, not an empty state). Approval and missing-report counts on the dashboard *are* real, reusing the same queries as Front desk's badge and missing-days prompt.
- **Stub routes** (`/employees`, `/reports` — manager+; `/salary`, `/partners` — owner-only) exist, correctly gated, with a plain "Coming soon" message (`components/stub-page.tsx`, no internal step numbers in user-facing copy) — so `proxy.ts`'s route map and each layout's `requireUser()` call are both already right when their steps fill them in. `/revenue` and `/expenses` are no longer stubs — see Step 2.3 below.
- **Mobile collapse** is the only client-side piece (`components/sidebar-toggle.tsx`, local `useState` — no date or role logic in it). User name and sign-out live inside the sidebar itself, not a separate header bar, so they're reachable the same way (open the drawer) on mobile as on desktop — an earlier draft put them in a desktop-only header and would have stranded reception, on a phone, with no way to sign out.

---

## Categories, and revenue/expenses outside the desk (Phase 2 §2.3)

- **`categories` is one collection for both revenue and expense categories**, editable at `/settings/categories` (manager+). Seeded on first use from `docs/spec.md` §4.2 (revenue), §4.5 (expense — via the live `EXPENSE_CATEGORIES`/`REVENUE_CATEGORIES` constants in `lib/nightReport.ts`, not retyped, so the seed can't drift from what reception actually had), and §5.2 ("everything reception never touches": salaries, rent, utilities, OTA commission, and the rest). Never hard-deleted, same `active: false` pattern as `paymentMethods`.
- **`standaloneOnly` is the field that keeps Rent and Salaries off the night report.** The front-desk pickers (`app/reception/page.tsx`) filter to `!standaloneOnly` before passing category names down to the form; the standalone `/expenses` and `/revenue` screens show everything active, both scopes. Without this, migrating the night report onto the same collection (below) would have flooded its petty-cash picker with categories that spec §5.2 explicitly says reception never touches.
- **The night report's `REVENUE_CATEGORIES`/`EXPENSE_CATEGORIES` migrated to the `categories` collection while there was almost no data to reconcile.** The Zod schema changed from `z.enum(REVENUE_CATEGORIES)` to a plain validated string — the DB is now the source of truth for which names are valid, checked in `submitNightReport()` against the currently-active categories (client's list can go stale between page load and submit, same reasoning as the payment-method/category-id checks below). The **stored shape is unchanged** (still a category name string on the businessDays document) — no historical document needed migrating, only where the valid-name list comes from. The two arrays stay in `lib/nightReport.ts`, now purely as the seed-data source (see above), not for validation.
- **`expenses` / `revenueEntries`: `categoryId` and `paymentMethodId` are references, not copied names** — §3 says these lists are "referenced by" the collections that use them. Both are re-validated against the currently-active set at submit time, not just checked against the static schema.
- **`linkedBusinessDayId` exists on both schemas but this step's own forms never set it** — always `null` (a genuinely standalone entry). The field is there for whatever eventually links a standalone entry to a specific night (not built yet); nothing in 2.3 needed that UI.
- **The double-counting rule is a real, tested function now, not just a convention.** `combinedTotalSen()` in `lib/reporting.ts` sums night-report line amounts plus standalone entries filtered to `linkedBusinessDayId === null` — built now even though the report screen that will call it is Step 2.8, so the rule exists as tested logic from the start.
- **Capital vs operating is expense-only** — `revenueEntries` has no equivalent field, matching §3's field list for each collection.
- Manager and owner only, per §4's table (`Expenses`/`Revenue entries`: No / Yes / Yes) — `/expenses`, `/revenue`, and `/settings/categories` are all gated `requireUser("manager")`.

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
