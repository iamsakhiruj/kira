# Phase 2 — data model and build plan

Partners and profit shares · employees and salary · standalone revenue and expenses · payment methods · the sidebar and dashboard.

Phase 1 gave you a night report, cash reconciliation and an approval queue. Phase 2 turns that into an accounts system.

**Sixteen collections in total.** Four already exist.

---

## 1. The one design trap to avoid

**Profit shares must be frozen at the moment of allocation, never read live.**

You have three partners on 50/30/20. In March you allocate the month's profit using those percentages. In June a partner's share changes to 40/35/25.

If the March allocation calculates its numbers by looking up the *current* percentages, March silently rewrites itself the moment you make that change. Every historical report shifts. Reconciling last year's distribution becomes impossible, and nobody notices until an argument about money.

The fix is small and must be in from the start: when a month is allocated, **copy each partner's percentage onto the allocation record**. The allocation is a permanent snapshot. Changing shares affects future months only.

Same principle as the immutable approved day in Phase 1. History does not move.

---

## 2. The company

**Hotel Bintang KL Sdn Bhd** — a private limited company, not a partnership or sole proprietorship. This was open question 1 below (and in Phase 1); it's answered now, and it changes real mechanics in three places: salary, partner withdrawals, and profit allocation.

**Director's salary needs PCB and EPF.** A sole proprietor cannot legally employ themselves — everything they take is a drawing regardless of what it's called. A director of a Sdn Bhd is different: they can be a genuine employee of the company, drawing a real salary. But "real" means real payroll — PCB (monthly tax deduction) and EPF apply to a director's salary exactly as they would to any other employee. This lands on **2.5 — Salary**: a partner/director salary line is not a special case exempt from statutory deductions, and the salary module needs to treat it as an ordinary employee record (which §3, Employees and salary, already anticipates — "partners who draw a salary appear here too").

**Partner withdrawals must be classified, not just recorded.** `partnerTransactions.purpose` (§3, Partners and profit) needs to distinguish five things, not treat every withdrawal the same:

- **Salary** — payroll, subject to PCB/EPF, run through 2.5, not a `partnerTransactions` drawing.
- **Dividend** — a distribution of post-tax profit, declared by the company. Only valid if the company actually has retained post-tax profit to declare — see the 2.7 note below.
- **Reimbursement** — the company repaying the director for a business expense they paid personally. Not income to them.
- **Loan repayment** — the company repaying money the director earlier lent it (an injection).
- **Director's loan** — the company lending money *to* the director. The one that needs watching — see next.

**Undocumented withdrawals default to a director's loan, and that carries Section 140B exposure.** Any withdrawal that isn't clearly one of the four categories above — cash taken with no stated purpose, or a purpose that doesn't match its paperwork — is legally a loan from the company to the director, whether anyone called it that or not. Under Section 140B of the Income Tax Act 1967, a director's loan or advance from a Sdn Bhd that doesn't charge interest at the prescribed rate is deemed to earn interest anyway, and that deemed interest is taxable income to the director. This is a recurring tax exposure, not a bookkeeping nicety — every `partnerTransactions` entry with `purpose` unset or ambiguous is a compliance problem. Worth surfacing, not just storing: flag undocumented withdrawals somewhere visible (the partner balance figure, or the dashboard), not just leave them queryable.

**2.7's allocations are dividends from post-tax profit, not gross profit shares.** A partnership can split the (pre-tax) profit the business made, in whatever ratio the partners agree. A Sdn Bhd cannot — the company pays corporate tax on its profit first, and only what's left (retained, post-tax profit) can legally be declared as a dividend to shareholders. `profitAllocations`' net profit figure (§3, Partners and profit) has to be **post-tax**, not the pre-tax operating result, or the "allocation" isn't legally a dividend at all. Practically, this also means month-close can't happen until the company's tax position for the period is known, which may push 2.7 later in the month than a pure partnership would need.

---

## 3. Collections

### Already built

| Collection | Holds |
|---|---|
| `users` | Login, name, role, active |
| `businessDays` | One night report per date, with embedded lines |
| `auditLog` | Every mutation: who, when, before, after |
| `propertySettings` | Cutoff hour, thresholds, room count |

### Partners and profit

**`partners`** — the people who own the hotel.

Name · Email · Phone · Active or exited · Joined date · Exit date · Notes

Note there's no `sharePercent` here. Shares change over time, so they live in their own collection.

**`partnerShares`** — effective-dated percentages.

Partner · Percentage · Effective from · Effective to (null = current) · Set by · Set at

Storing shares this way means "what were the splits in March" is answerable, not guessed. **Validation: active shares on any given date must total exactly 100.** Refuse to save a set that doesn't, and show the running total as they're entered.

**`profitAllocations`** — one per month, created when you close the month.

Month · Net profit in sen · Status (draft / locked) · Allocated by · Allocated at ·
Lines: partner, **percentage used**, amount in sen

That percentage on the line is the snapshot. It's the whole point of this collection.

Locking a month prevents re-allocation. Corrections are a new adjustment allocation referencing the original — same rule as approved days.

**`partnerTransactions`** — money in and out, per partner, any time.

Partner · Date · Amount · Direction (drawing / injection) · Payment method · Purpose (share of profit / salary / expense reimbursement / loan repayment) · Reference · Note · Recorded by

The **purpose** field is doing real work, as it did in Phase 1. Money a partner takes because they earlier put cash in is a repayment, not a drawing.

**The partner balance** — computed, not stored:

```
  Total profit allocated to this partner (all locked months)
+ Total injections
− Total drawings
= Balance
```

Positive means they have profit not yet taken. Negative means they've drawn more than they've earned — which happens, and is exactly the number you want visible. This is the single most useful figure in the partner module.

### Employees and salary

**`employees`**

Name · IC or passport · Nationality · Position · Department · Join date ·
**Pay type: monthly or daily** · Basic amount in sen · Fixed allowances ·
Bank name and account · EPF, SOCSO and tax numbers ·
Work permit and passport expiry (foreign staff) ·
Status: active / on leave / **paused** / resigned · Status changed date · Notes

You asked for pause as distinct from remove — that's the `paused` status. Nothing is ever deleted; a resigned employee stays in the record with their history, otherwise last year's payroll stops adding up.

**Partners who draw a salary appear here too.** You as digital marketing manager is an employee record with `payType: monthly` and a fixed amount, plus a link to your partner record. That salary is a business expense. Anything above it is a drawing. Deciding this once, in the employee record, is what keeps the two from blurring.

**`attendance`** — one document per employee per month, with a day array.

Employee · Month · Days: [{ day, status, note }] · Updated by · Updated at

Status per day: `present` · `annual_leave` · `sick_leave` · `public_holiday` · `unpaid_absence` · `rest_day`

**This is the field that keeps you legal.** Under the Employment Act, monthly-rated staff receive their full monthly wage regardless of paid leave taken — annual leave, sick leave and public holidays are paid days. Only *unpaid absence* reduces monthly pay. Calculating "22 days worked = 22/30 of salary" would underpay them and breach the Act.

So the two pay types calculate differently:

- **Daily-rated** — daily rate × days with status `present`
- **Monthly-rated** — full monthly amount, minus the ordinary rate of pay for each `unpaid_absence` day only

One document per employee per month keeps this to five reads for a five-person team.

**`salaryPayments`**

Employee · Month · Pay type · Gross · Days worked · Unpaid days · Deductions (advance repayment, unpaid absence, other) · Net · Payment method · Paid date · Paid by · Status (draft / paid)

**`advances`**

Employee · Date · Amount · Reason · Paid from (front desk cash / bank / owner) · Approved by · Repayment plan · Outstanding balance · Acknowledgement note

If paid from front desk cash, it posts a cash-out line to that day's night report — the Phase 1 rule still applies, or the drawer won't balance.

### Revenue and expenses outside the front desk

Phase 1 captures what happens at the desk. These capture everything else — rent paid by bank transfer, a supplier settled from your own e-wallet, a corporate payment landing directly in the account.

**`expenses`**

Date · Category · Amount · Payment method · Paid to · Paid by (user) · Capital or operating · Reference · Note · Receipt URL · Linked business day (null if not from the desk)

**`revenueEntries`**

Date · Category · Amount · Payment method · Received from · Reference · Note · Linked business day (null if not from the desk)

**How these relate to the night report.** The night report is the source of truth for front desk activity. These collections hold everything else. Monthly reports read both and combine them.

**The rule that prevents double counting:** an item recorded in a night report is never also recorded here. When reporting, sum night report lines *plus* standalone entries where `linkedBusinessDay` is null.

### Payment methods

**`paymentMethods`** — one editable list, used everywhere.

Name · Type (cash / bank transfer / card / e-wallet / cheque / other) · Active · Display order

Defaults: Cash · Bank transfer · DuitNow QR · Card terminal · Touch 'n Go · GrabPay · ShopeePay · Cheque

One list referenced by revenue, expenses, partner transactions and salary payments. Not four separate hardcoded enums — when you start accepting a new e-wallet, you add it once.

### Corrections

**`correctionRequests`** — reception can't edit a submitted report, so they ask.

Business day · Requested by · Requested at · Field or description · What it should be · Reason · Status (open / applied / rejected) · Resolved by · Resolved at · Resolution note

You make the actual change; they never touch the figures. The request and its resolution both land in the audit log.

### Reference

**`categories`** — editable revenue and expense category lists, with a type and display order.

---

## 4. Roles

Three levels.

| | Reception | Manager | Owner |
|---|---|---|---|
| Submit night report | Yes | Yes | Yes |
| See own reports and missing days | Yes | Yes | Yes |
| Request a correction | Yes | Yes | Yes |
| Approve a day | No | Yes | Yes |
| Apply a correction | No | Yes | Yes |
| Expenses | No | Yes | Yes |
| Revenue entries | No | Yes | Yes |
| Employee list | No | Names and positions | Full |
| **Salaries and payroll** | No | **No** | **Yes** |
| Attendance | No | Yes | Yes |
| Advances | Record cash out only | Yes | Yes |
| **Partners, shares, drawings** | No | **No** | **Yes** |
| **Profit and allocations** | No | **No** | **Yes** |
| Reports | Own reports only | Operations | Everything |
| Manage users | No | No | Yes |

Enforce server-side on every query. Never by hiding menu items.

**Still to decide:** whether the manager sees revenue totals. They already see expenses, so revenue lets them estimate your profit. If that's unwanted, the manager gets occupancy and operations without the money — still enough to run a hotel.

---

## 5. Sidebar

```
Dashboard
Front desk        night reports, missing days, corrections
Revenue           entries, monthly totals
Expenses          entries, by category
Employees         list, attendance, advances
Salary            payroll runs                      [owner]
Partners          shares, drawings, balances        [owner]
Reports           weekly, monthly, export
Settings          categories, payment methods, users
```

Reception sees **Front desk** only, and lands there on login rather than on a dashboard of things they can't open.

A count badge on Front desk when days await approval — visible from the dashboard without displacing it.

---

## 6. Dashboard

Your ranking: this month's numbers, then approvals, then cash, then bills.

**Top row** — Revenue, Expenses, Net profit, this month, each with a comparison against last month.

**Second row** — Days awaiting approval, with a link. Missing night reports, highlighted, since a gap is worse than an unapproved day.

**Third row** — Cash in hand at the front desk. Month-to-date cash variance, which is the number that tells you whether the drawer is being handled properly.

**Fourth row** — Upcoming commitments: salary day, the 15th for statutory payments, anything else scheduled.

**Partner strip, owner only** — each partner's allocated share, drawings taken, and balance.

Occupancy, ADR and RevPAR belong here too once the room count is set.

---

## 7. Build order

Each is roughly one Claude Code session.

**2.1 — Roles and payment methods.** Add `manager`. Update the guard and CLAUDE.md rule 7. Create the `paymentMethods` collection with defaults and a settings screen. Everything downstream depends on both.

**2.2 — Sidebar and shell.** The layout, role-filtered navigation, and an empty dashboard. Do this before the feature screens so each one lands into a finished frame instead of being retrofitted.

**2.3 — Expenses and revenue entries.** Both collections, both screens, payment method on each, category management. The double-counting rule enforced in code.

**2.4 — Employees and attendance.** Employee CRUD with pause and resign. The monthly attendance grid with the six day statuses. No salary calculation yet.

**2.5 — Salary.** Both pay types, the Employment Act rules on paid versus unpaid leave, advance deduction, payment recording. Owner only. Test the monthly-rated leave case explicitly — it's the one that's legally wrong if rushed.

**2.6 — Partners.** Partner records, effective-dated shares with the 100% check, drawings and injections, the balance calculation.

**2.7 — Profit allocation.** Month close, the allocation with **frozen percentages**, locking, and the partner statement.

**2.8 — Reports and dashboard.** Weekly and monthly, combining night reports with standalone entries. Dashboard populated. CSV export.

**2.9 — Corrections.** The request flow. Last because it's the least urgent while you're the only one entering data.

---

## 8. Open questions

1. ~~**Sdn Bhd, partnership, or sole proprietorship?**~~ **Answered: Sdn Bhd.** Hotel Bintang KL Sdn Bhd — see §2, The company, for what this means for director salary, withdrawal classification, and 2.7's dividend mechanics.
2. Does the manager see revenue totals?
3. Sellable room count — needed for occupancy on the dashboard.
4. iHotel night audit time — needed so your figures reconcile with theirs.
5. Current partner split, and has it ever changed? If so, from when? That decides whether `partnerShares` needs backdated rows on day one.
6. Are profits actually distributed monthly, or left in the business and drawn ad hoc? Changes whether allocation is a monthly ritual or an occasional one.

---

## 9. What I'd watch

**Phase 2 is bigger than Phase 1.** Nine sessions against nine steps, but each is wider. Resist doing two at once.

**2.5 and 2.7 are where mistakes cost real money.** Salary that underpays staff breaches the Act. A profit allocation that reads live percentages quietly rewrites history. Both are worth going slowly on.

**Use Phase 1 daily while building Phase 2.** Every night report you submit is a test of the foundation the rest sits on, and problems found now are cheap.
