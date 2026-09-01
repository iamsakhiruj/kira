# Phase 1 build plan

Nine steps, each roughly one Claude Code session. Do them in order — later steps assume the earlier ones exist.

**The goal of Phase 1 is one thing:** reception submits a night report, the owner approves it, and the cash balances. Everything else is support for that.

---

## Before you start

Answer these. They're baked into code and painful to change later.

- [ ] **Is MongoDB a replica set or standalone?** Decides whether transactions are available. Atlas is a replica set; a plain `mongod` on a VPS is not.
- [ ] **Where does the app run?** If Mongo is on Atlas, Vercel is the least work. If Mongo is self-hosted on your own VPS, run Next.js on the same box behind Caddy or nginx — Caddy will get the TLS certificate for `account.hotelbintangkl.com` automatically.
- [ ] **What hour does the business day start?** 06:00 is the default. Pick one and don't change it after data exists.
- [ ] **How many rooms are sellable?** Needed for occupancy.
- [ ] **What's the opening cash float at the front desk?**

DNS: point an A record for `account` at the server, or a CNAME if you're on Vercel. Do this early — propagation is the one thing you can't speed up at the end.

---

## Step 1 — Foundation

Next.js + TypeScript + Tailwind. MongoDB connection with a cached client for hot reload. Zod. `.gitignore` covering `.env*` before the first commit.

Write and test three files first, before any feature code:

- `lib/money.ts` — sen ↔ display conversion, parsing user input, formatting
- `lib/businessDate.ts` — business date from an instant plus cutoff hour, in KL time
- `lib/audit.ts` — the write-to-log helper every mutation calls

These carry all the arithmetic that matters. Unit test them properly; the rest of the app is CRUD.

**Design system wiring (from `app/globals.css`, done in Step 0):**

- [ ] **Merge design tokens into scaffolded `globals.css`.** `create-next-app` generates its own `app/globals.css` and will overwrite ours. Before scaffolding: `cp app/globals.css app/globals.css.bak`. After scaffolding: merge the tokens/utilities from the backup into the generated file, then delete `app/globals.css.bak`.
- [ ] **Wire `next/font/google` in `app/layout.tsx`.** The font stack references `var(--font-inter)`, which does not exist until Inter is loaded (weights 400/600, `display: swap`, `variable: "--font-inter"`) and `inter.variable` is applied to `<html>`. Until then, non-Apple devices fall back past a missing font. **This is a blocker on Step 1 being "done".**

**Done when:** app builds, connects to Mongo, those three modules pass their tests, and both checklist items above are complete.

---

## Step 2 — Auth and roles

Session-based login. Two roles, `reception` and `owner`. Hashed passwords. A seed script creating one owner account.

Middleware that enforces role at the route level, and a server-side guard on every data query. **Never rely on hidden UI for access control** — reception must not be able to reach owner data by typing a URL.

**Done when:** you can log in as each role, and a reception session gets a 403 on an owner route.

---

## Step 3 — The night report form

The core screen. Spec section 4.

Rooms, other revenue, collections by channel, cash reconciliation, petty cash expenses including kitchen purchases, remarks. Computed live: occupancy, ADR, expected cash, **variance**.

Save drafts to local storage as they type. A dropped connection at 1am must not lose twenty minutes of entry.

Submit locks the report to `submitted`.

**Done when:** you can fill it in on a phone, in under five minutes, and the variance calculates correctly. Test the phone part on an actual phone.

---

## Step 4 — Owner review

List of business dates with status, including **missing** days. Detail view of any report. Approve, query, or correct.

Approval locks the day permanently. Corrections are new entries referencing the original — never edits to history.

**Done when:** a missing night report is visible without hunting for it.

---

## Step 5 — Employees and advances

Employee list: name, position, join date, active. Foreign staff get permit and passport expiry fields.

Recording an advance: employee, amount, reason, approved by, repayment plan. **If paid from front desk cash, it must post a cash-out line to that day's report** — this is the atomicity question from CLAUDE.md.

Running balance per employee. Warn if a proposed repayment would exceed 50% of monthly wages.

Reception can record that cash left the drawer. Reception cannot see balances.

**Done when:** an advance paid from the drawer makes the expected cash drop by exactly that amount.

---

## Step 6 — Owner drawings

Same mechanics as advances, different meaning. In or out, source of cash, purpose, running balance.

**Excluded from profit. Included in cash.** Spec 5.4 explains why this matters.

**Done when:** taking RM 1,000 changes closing cash by RM 1,000 and changes net profit by nothing.

---

## Step 7 — Monthly summary

Revenue by source, expenses by category, net profit. Separately: cash movement including drawings. Occupancy, ADR, RevPAR. The month's total cash variance.

CSV export of everything, for the accountant.

**Done when:** the profit figure and the cash figure are visibly different numbers with a visible explanation of the gap.

---

## Step 8 — Statutory reminders

Small and standalone. Generate recurring obligations twelve months ahead: salary day, the 15th for EPF/SOCSO/EIS/PCB, licence and permit renewals, and any quarterly or half-yearly bills.

Reminder lead time configurable per item, defaulting to 7 days. "Due this week" panel on the owner's home screen.

**Done when:** logging in shows what's due in the next seven days without clicking anything.

---

## Step 9 — Deploy and harden

Domain and TLS. Automatic daily database backup, restored once to prove it works — an untested backup is not a backup. Basic error logging. A separate read-only Mongo user for anything that only reports.

Then **run it in parallel with your current method for one month.** Both, every night. Where they disagree, find out why. Only stop the old method when they've agreed for two weeks straight.

---

## Working with Claude Code

**One step per session.** Start each with: *"Read CLAUDE.md and docs/spec.md. We're on step N."* Context resets, and the files are what carry the decisions forward.

**Commit at every step boundary**, with the step number in the message. When something breaks three steps later, you want a clean point to return to.

**Update CLAUDE.md when a decision changes.** A stale brief is worse than none — Claude Code will confidently follow it into the wrong design.

**Push back on scope.** If a step starts growing supplier invoices or payroll calculations, stop. Those are Phase 2 and 3, and Phase 1 has to be finished and in daily use before either is worth starting.
