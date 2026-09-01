# Hotel Daily Accounts & Invoicing System
### Requirements specification — draft 1

**Prepared for:** hotel operation currently running iHotel PMS
**Date:** 1 September 2026
**Status:** draft for review. Nothing here is final — the open questions at the end need your answers before anyone writes code.

---

## 1. What this system is for

Every night, the front desk closes the day and reports what happened: how much money came in, how it came in, how many rooms were sold, and what was spent. Right now that information either lives in iHotel, on paper, or in someone's head, and the owner finds out later — often too late to ask questions.

This system does three jobs:

1. **Capture the night report** — one structured submission per business day, made by reception before they go home.
2. **Reconcile it** — the owner reviews, questions, and approves each day. Cash on hand should match what was declared. Room revenue should match what was collected plus what is still owed.
3. **Bill the monthly guests** — long-stay guests and corporate accounts accumulate charges and get a proper invoice, with payments tracked against it.
4. **Track staff advances** — who has taken money against their salary, how much is still owed, and where that cash left the drawer.
5. **Track what you owe** — supplier bills received, when they're due, and what's still unpaid.
6. **Remind you** — what has to be paid this week, and what statutory deadline is coming.

It is **not** a replacement for iHotel and it is **not** a full accounting package. It sits between them: iHotel knows about rooms, a proper accounts package knows about ledgers, and this system knows about *money moving through the front desk*.

---

## 2. Who uses it

Two logins, two very different views.

**Reception**
Sees today and yesterday only. Submits the night report. Records petty cash spending. Posts charges to a monthly guest's account. Cannot see profit, cannot see other months, cannot edit a day the owner has already approved.

**Main account (owner / manager)**
Sees everything. Reviews and approves each day. Records expenses paid outside the front desk — salaries, rent, utilities, supplier payments from the bank. Issues invoices. Records payments received. Runs all reports. Manages categories, room rates, and users.

Keeping these separate is the point. Reception should have as little discretion as possible, and every entry they make should carry their name and a timestamp. This is what makes cash accountability real rather than aspirational.

---

## 3. The one concept the design turns on

**Money earned and money received are not the same thing, and mixing them will make the numbers lie.**

A room sold tonight can produce cash tonight, a bank transfer tomorrow, an OTA payout in two weeks, or an invoice settled next month. If the system records only "revenue", the cash drawer will never balance. If it records only "collections", the monthly guests will look like they generated nothing.

So every night report captures three separate things:

| | What it means | Example |
|---|---|---|
| **Revenue** | What the hotel earned today | 12 rooms sold, RM 1,850 |
| **Collections** | What actually arrived today | RM 620 cash, RM 700 DuitNow, RM 180 card |
| **Receivables** | Earned but not yet received | RM 350 to a monthly guest's account |

Revenue = Collections + Receivables added today − Receivables settled today. The system should compute this and refuse to accept a report where it doesn't hold, or at minimum flag the gap for the owner.

Money that arrives but isn't revenue also needs its own place: **guest deposits** (advance, refundable), and **tourism tax** (collected for the government, never the hotel's income).

---

## 4. Screen one — the night report

One submission per business date. Reception fills it in at the end of the night shift.

**First: define the business date.** Does your day run midnight to midnight, or does the night audit close at 6am and count 2am arrivals as the previous day? Pick one and never change it. This is question 1 in the open list.

### 4.1 Rooms

| Field | Notes |
|---|---|
| Rooms available | Total sellable rooms, minus any out of order |
| Rooms sold | Paid occupancy |
| House use / complimentary | Occupied but not charged — kept separate so it doesn't inflate ADR |
| Room revenue | Total room charges posted today |
| Occupancy % | Computed |
| ADR | Computed: room revenue ÷ rooms sold |
| RevPAR | Computed: room revenue ÷ rooms available |

If reception is reading these off an iHotel daily report, add an optional **photo upload of that report**. It takes five seconds and gives the owner something to check against.

### 4.2 Other revenue

Free-form lines: food & beverage, laundry, hall or function room, parking, late checkout, extra bed, damages recovered, other. Each line is a category plus an amount.

### 4.3 Collections

| Channel | Notes |
|---|---|
| Cash | Physical notes taken at the desk |
| Card terminal | Settles to bank in a day or two — track the settlement separately |
| DuitNow / bank transfer / QR | Should be verifiable against the bank the same day |
| E-wallet | TNG, GrabPay, ShopeePay |
| OTA — prepaid | Guest paid the OTA. Nothing arrives at the desk. Booked as a receivable from the OTA |
| Charge to account | Monthly guest or company. Becomes a receivable |
| Deposits received | Money in, not revenue |
| Refunds paid out | Money out, reduces collections |

The OTA line matters more than it looks. If a prepaid Agoda booking gets recorded as cash, the drawer is short and nobody knows why.

### 4.4 Cash reconciliation

This is the part that catches problems, so it should be arithmetic the system does, not the staff:

```
  Opening float
+ Cash collected
− Cash paid out (petty cash expenses)
− Cash banked in
= Expected cash on hand
```

Reception then enters **actual cash counted**. Any difference becomes a **variance**, with a mandatory reason if it exceeds a threshold you set (say RM 20). Variances are never silently absorbed. They are reported, and they roll up into a monthly variance total — which is one of the most useful numbers the owner will get out of this whole system.

### 4.5 Expenses paid today

Petty cash only at this screen. Each line: category, amount, paid to, paid by (cash or card), optional receipt photo. Set a per-item ceiling — anything above it needs the owner, not reception.

Categories: guest supplies, cleaning materials, minor repairs, transport, staff meals, stationery, water/gas top-up, miscellaneous.

### 4.6 Daily kitchen and food purchases

Food bought every day is a different shape of expense from everything else: small, frequent, usually cash, and often with no receipt at all. Handling it like a supplier invoice will not survive contact with a wet market.

**First, split it into two categories and never mix them.**

| | What it is | Where it belongs |
|---|---|---|
| **Staff meals** | Feeding your own employees | Staff cost |
| **F&B cost of sales** | Ingredients for food you sell to guests | Cost of sales, against F&B revenue |

Both might be bought on the same morning trip, but merging them ruins two numbers at once: your restaurant looks unprofitable and your staff cost looks lower than it is. If one person buys for both, they estimate the split at the point of purchase. A rough split entered daily beats a precise one nobody ever does.

**Then pick how the money moves.** Two workable patterns:

**Option A — a daily line on the night report.** One entry per day: "Kitchen purchases — RM 85", category, optional receipt photo. It flows through the cash reconciliation in 4.4 like any other petty cash spend. Simplest, and right if reception hands over the cash each morning.

**Option B — a kitchen float.** Give the cook a fixed float, say RM 300. They spend it over several days and come back when it runs low. You record the **top-ups**, not every purchase. Each top-up requires them to account for what the previous float was spent on, in whatever detail is realistic — a page of scribbled amounts is fine as an attached photo.

Option B is usually better where the cook buys directly and reception isn't involved. It also cuts the daily data entry from one entry per day to roughly one per week.

**What actually makes this useful: cost per head per day.** Total staff food spend divided by staff fed divided by days. It should be a stable number — say RM 8 to RM 12 a head — and when it drifts upward without more staff, that's the signal worth having. Monitoring the daily figure tells you nothing; monitoring the per-head figure tells you a lot.

For guest F&B, the equivalent is **food cost as a percentage of F&B revenue**. Both belong in the monthly report.

**One tax note.** Buying food and providing it to staff is not the same as paying them a meal allowance in cash. Food and drink provided free of charge is generally tax-exempt for the employee, while a fixed cash meal allowance is generally treated as part of wages — taxable, and counted for EPF. If you currently hand out cash instead of cooking on some days, those two things need separate categories in the system, because one is an operating expense and the other is payroll. Worth confirming with your accountant.

### 4.7 Remarks

Free text. Complaints, walk-ins turned away, maintenance issues, anything unusual. Cheap to include, and it's usually where the owner learns something.

### 4.8 Submit

On submit the report locks to **Submitted**. Reception can no longer edit. If something was wrong, the owner unlocks it or posts a correction — and either way an audit entry records who, when, and why.

---

## 5. Screen two — the main account console

### 5.1 Daily review queue

A list of business dates and their status: *Missing*, *Submitted*, *Approved*, *Query raised*. A missing night report should be visible immediately, not discovered at month end.

For each day the owner sees the full report, the computed variance, and buttons to approve, query, or correct. Approval locks the day.

### 5.2 Expenses outside the front desk

Everything reception never touches: salaries and EPF/SOCSO, rent, electricity and water, internet, OTA commission invoices, laundry contractor, licences and council fees, insurance, loan repayments, marketing, accounting fees, renovation and capital items.

Two useful features here:
- **Recurring expenses** — rent and salaries are the same most months. Pre-fill them so the owner confirms rather than retypes.
- **Capital vs operating flag** — a new air-conditioner is not the same as an electricity bill, and your accountant will thank you.

### 5.3 Bank reconciliation

Cash banked in by reception should match deposits appearing on the bank statement. Card settlements should match terminal batches. OTA payouts should match remittance advice. The system tracks each as *declared* → *confirmed received*, and shows what's still outstanding.

### 5.4 Owner drawings and injections

**Owner drawings should not be deducted from profit.** This is the single most common bookkeeping mistake in owner-run businesses, and it matters because it makes the hotel look less profitable than it is.

Profit measures whether the business works. Drawings measure what you chose to take out of it. If you take RM 8,000 in a month the hotel made RM 10,000, the hotel still made RM 10,000 — you just moved RM 8,000 of it to yourself. Subtracting it produces a "profit" of RM 2,000, which is not a number that means anything. It also breaks year-on-year comparison: a month where you took nothing looks brilliant and a month where you took a lot looks terrible, regardless of how the hotel actually traded.

There's a tax consequence too. Drawings are not a deductible business expense. Filing on a profit figure that has drawings subtracted from it understates income, and that is the kind of error a tax audit finds.

**What you actually want is two bottom lines**, and the system should show both:

```
  Revenue
− Operating expenses
= Net profit                          ← how the hotel performed

  Opening cash
+ Collections
− Expenses paid
− Owner drawings                      ← your money out
+ Owner injections                    ← your money in
− Loan repayments
= Closing cash                        ← what's actually left
```

The first tells you whether the business works. The second tells you whether you can pay the staff on the 28th. Both are essential, and conflating them destroys both.

**Recording a drawing**

| Field | Notes |
|---|---|
| Date | |
| Amount | |
| Direction | Money taken out / money put in |
| Taken from | Front desk cash / bank / other |
| Purpose | Personal use, salary/fee, repayment of money you lent the business, expense reimbursement |
| Note | Free text |

The **purpose** field is doing real work. Money you take because you earlier put your own cash in is a repayment, not a drawing. Money you take to pay a hotel supplier out of your own pocket is a business expense with a receipt. Money you take for yourself is a drawing. These are three different things and the running owner balance is only meaningful if they're separated.

**The cash link, same as staff advances.** A drawing taken from the front desk drawer must post to that day's night report as a cash-out line under **Owner drawings**, or the cash count won't balance. Reception should be able to record that the cash left — they should not be able to see the drawing history or the running balance.

**Running owner account.** Total put in, total taken out, net position, with full history. Your accountant will ask for exactly this at year end, and producing it from a system rather than from memory is most of the value.

**Business structure changes the treatment.** Worth confirming with your accountant, but broadly:

- **Sole proprietor or partnership** — money you take is drawings against your capital. You're taxed on the business's profit whether or not you took it out.
- **Sdn Bhd** — the company's money is not your money, and how you take it out matters. Director's salary or fee is deductible but carries PCB and EPF obligations. Dividends come out of post-tax profit and aren't deductible. Reimbursements need receipts. Anything else lands in the **director's account** as a loan, and that carries real consequences: Section 224 of the Companies Act 2016 restricts loans to directors, and under Section 140B of the Income Tax Act the company is deemed to earn interest on director loans funded from internal money — taxable at the corporate rate even though no interest was ever charged, calculated monthly against Bank Negara's average lending rate. A long-running director's account is one of the first things reviewed in a tax audit.

If you're a Sdn Bhd, the **purpose** field stops being a nice-to-have and becomes the thing that keeps that ledger clean.

### 5.5 Reports

- Daily revenue report (the classic one-pager)
- Monthly summary: revenue by source, expenses by category, net position
- Cash movement statement: separate from profit, showing drawings, injections and closing cash
- Cash forecast: what's due over the next 30, 60 and 90 days against expected collections
- Owner account: money in, money out, running balance, by purpose
- Occupancy, ADR, RevPAR — daily, monthly, and same month last year
- Staff food cost per head per day, and F&B cost as a percentage of F&B revenue
- Collections by payment channel
- Cash variance log
- Receivables aging: 0–30, 31–60, 61–90, over 90 days
- Export to CSV or Excel for the accountant

---

## 6. Monthly guests and invoicing

### 6.1 Accounts

An account is a long-stay guest or a company that books regularly. Fields:

Name · Type (individual / company) · IC or passport number · SSM registration number · **TIN** · SST registration number if any · Billing address · Contact person, phone, email · Agreed rate · Credit terms (7 / 14 / 30 days) · Credit limit · Active or closed

The TIN, SSM number and full address are e-Invoice requirements. Capture them from day one even if you aren't submitting to MyInvois yet — collecting them later, from a customer who has already checked out, is painful.

### 6.2 Charges

Charges post to the account as they happen — daily room charge, laundry, extras. Reception can post; only the owner can reverse. The account carries a running balance and shows against the credit limit.

### 6.3 Invoices

Generated for a date range, usually a calendar month.

- **Numbering**: sequential, gapless, never reused. Format `INV-2026-0001`. Invoices are never deleted — only **voided**, with a reason, and the number stays consumed.
- **Lines**: description, dates, quantity (nights), unit rate, amount.
- **Tax**: service tax at the current rate if you're SST-registered; tourism tax as a separate line where it applies.
- **Status**: Draft → Issued → Part paid → Paid → Overdue → Void.
- **Output**: PDF, emailable, with your letterhead and bank details.

### 6.4 Payments

Recorded against an invoice, not just against the account, so you always know which invoice is settled. Supports partial payment and one payment covering several invoices. Payment date, method, reference number, and optional slip upload.

### 6.5 e-Invoice readiness

Malaysia's mandate has worked down to small operators. Depending on your turnover you may already be in scope, or be entering it. **Confirm your exact date on the MyInvois portal or with your tax agent — do not rely on this document for that.**

The sensible build order:

- **Now:** capture all buyer fields the standard requires. Structure invoice data so it can be exported cleanly. Cost: almost nothing.
- **Phase 2:** manual submission through the MyInvois portal, with the system producing a file or a clean field-by-field view to copy from. Fine at low volume.
- **Phase 3:** direct API integration, or a middleware provider that handles validation, digital signing and submission. Only worth it once volume makes manual submission annoying.

Note also the rule that individual invoices are required above RM 10,000 — consolidated invoices don't cover those.

---

## 7. Suppliers and purchase invoices

Section 6 covers money coming in. This is the mirror image: bills you receive from outside — the laundry contractor, the grocery supplier, the aircon technician, the OTA sending its monthly commission invoice.

### 7.1 Two kinds of buying, and the rule that keeps them apart

| | What happens | Where it goes |
|---|---|---|
| **Cash purchase** | Reception buys light bulbs, pays at the counter, brings back a receipt | Petty cash expense on the night report (4.5) |
| **Credit purchase** | Supplier delivers, sends a bill, you pay in 30 days | Supplier invoice, recorded here |

**The rule: every purchase is recorded exactly once.** A bill recorded here and then entered again as a petty cash expense when it's paid will double your costs for that item. The system should make this structurally impossible — paying a supplier invoice settles the existing bill, it never creates a new expense.

### 7.2 When to record the cost

Record the expense on the **invoice date**, not the payment date. A RM 3,000 laundry bill for August, paid in September, is an August cost. Booking it in September makes August look profitable and September look terrible, and neither figure describes what happened.

This is the same distinction as section 3, running the other way: **cost incurred** and **cash paid** are different events, and the system tracks both.

### 7.3 Supplier record

Name · Type (company / individual) · SSM registration number · **TIN** · SST registration number if any · Address · Contact person, phone, email · Payment terms · Bank account for transfers · What they supply · Active or closed

Same reasoning as guest accounts in 6.1: capture the tax identifiers now, because chasing a supplier for their TIN a year later is a bad afternoon.

### 7.4 Recording a purchase invoice

| Field | Notes |
|---|---|
| Supplier | From the list |
| Supplier's invoice number | Theirs, not yours. Used to catch duplicates |
| Invoice date | Drives which month carries the cost |
| Due date | Computed from terms, editable |
| Lines | Description, quantity, unit price, amount |
| Expense category | Same list as everywhere else |
| Capital or operating | A new water heater is not an electricity bill |
| SST | Where charged. See 7.7 |
| Total | |
| Attachment | Photo or PDF of the invoice — required, not optional |
| Status | Unpaid / Part paid / Paid / Overdue / Disputed |

**Duplicate detection.** Same supplier plus same invoice number should be refused outright. Paying the same bill twice is the most common and most expensive purchasing error in small businesses, and suppliers rarely volunteer the correction.

**Delivery orders.** Many suppliers deliver on a DO and invoice at month end. If that's how yours work, let reception record the DO when goods arrive — supplier, date, items, signed slip photo — and match the DOs against the monthly invoice when it comes. The mismatch is where you find you were billed for a delivery that never arrived.

### 7.5 Paying it

Payment recorded against the invoice: date, amount, method, reference number, optional payment slip. Supports partial payment and one transfer covering several invoices.

Payment reduces cash. It does not create an expense — the expense was already recognised at 7.2.

### 7.6 What the owner sees

- **Payables aging**: 0–30, 31–60, 61–90, over 90 days. The exact mirror of the receivables report in 5.5.
- **Due this week**: the list you actually work from
- **Spend by supplier** over any period — this is where you notice one supplier quietly became your biggest cost
- **Spend by category**, feeding the monthly P&L
- **Disputed items** still outstanding

### 7.7 Tax and e-Invoice notes

*Confirm all of this with your accountant. I'm not a tax advisor.*

**SST paid on purchases is a cost, not a credit.** Unlike the old GST, Malaysia's SST has no input tax credit mechanism — service tax and sales tax you pay to suppliers cannot be recovered. Design implication: record the tax as part of the expense and do not build any input-recovery logic. The standard service tax rate is 8%, with 6% applying to categories including food and beverage, telecommunications, parking and logistics.

**Store your suppliers' e-Invoices.** As the mandate spreads down to smaller businesses, more of your suppliers will be issuing validated e-Invoices. You need to collect and keep them, because a validated e-Invoice is what supports the deduction. The attachment field in 7.4 is where they live.

**Self-billed e-Invoices are a real obligation, and they're easy to miss.** In certain situations the *buyer* issues the e-Invoice, not the seller. The common ones for a hotel:

- Rent paid to an individual landlord
- Payments to foreign suppliers, including overseas OTAs
- Commission paid to agents
- Payments to individuals who aren't in the mandate

If you rent your building from a person rather than a company, that one probably applies to you. Worth asking your accountant before you build, because it changes what this module has to produce.

---

## 8. Employees, advances and salary

Staff advances are the reason this section has to exist in Phase 1 rather than later. An advance handed over from the front desk drawer is a cash movement, and if the system doesn't know about it, the nightly cash count will be short with no explanation. Everything else here can wait.

*Note: the statutory figures below are current as far as I can establish and are given so the design has something concrete to work with. Confirm every rate with KWSP, PERKESO, LHDN, or your payroll agent before relying on them. I'm not a licensed tax or labour advisor.*

### 8.1 Employee record

| Group | Fields |
|---|---|
| Identity | Name, IC or passport number, nationality, date of birth, photo |
| Employment | Position, department, join date, type (full-time / part-time / casual), status (active / resigned / terminated), resignation date |
| Contact | Phone, address, next of kin and their phone |
| Pay | Basic salary, fixed allowances, pay frequency, bank name and account number |
| Statutory | EPF number, SOCSO number, income tax (PCB) number |
| Foreign staff | Passport expiry, work permit number and expiry, FOMEMA expiry, levy paid by employer |

The expiry dates earn their place. A hotel that lets a work permit lapse has a much bigger problem than a bookkeeping one, so the system should show a standing list of anything expiring in the next 60 days.

### 8.2 Advances

**Recording an advance**

| Field | Notes |
|---|---|
| Employee | From the list |
| Date | |
| Amount | |
| Reason | Free text, but required |
| Paid from | Front desk cash / owner's cash / bank transfer |
| Approved by | Owner. Reception can hand it over, but cannot authorise it |
| Repayment | One deduction next payday, or *n* monthly instalments |
| Acknowledgement | Optional photo of a signed slip |

**The cash link.** When an advance is marked *paid from front desk cash*, the system automatically posts a cash-out line to that business day's night report under **Staff advance**. Reception's expected cash on hand drops by exactly that amount, and the drawer balances.

Note what it is *not*: an advance is not an expense. It is money the employee now owes back. Recording it as an expense will overstate your costs this month and understate them next month. It sits as a receivable until it's deducted from pay.

**Per-employee balance.** Total advanced, total repaid, outstanding. Visible at a glance on the employee record, and a summary list showing everyone with an outstanding balance.

**Legal guardrails worth building in.** These are Employment Act 1955 rules, and the software can quietly keep you on the right side of them:

- **No interest.** Section 27 forbids charging interest on a wage advance. Don't build an interest field at all.
- **Advance ceiling.** Under Section 22, advances of wages not yet earned in any one month must not exceed the wages the employee earned the previous month. The system should warn when a request goes past that.
- **The 50% deduction cap.** Section 24 caps total deductions in any month at 50% of that month's wages, with narrow exceptions such as final pay and approved housing loans. If a scheduled advance repayment would breach it, the system should flag it and offer to spread the repayment instead. This is the guardrail most worth having — it's easy to breach by accident with a small-salary employee who took a large advance.
- Deductions for advances need the employee's written agreement, so keeping the signed acknowledgement attached to the record is practical protection, not paperwork.

### 8.3 Salary calculation

```
  Basic salary
+ Fixed allowances
+ Overtime
+ Service charge share            (if you distribute one)
+ Bonus / incentive
= Gross pay

− EPF (employee share)
− SOCSO (employee share)
− EIS (employee share)
− PCB
− Advance repayment              ← comes straight from 7.2
− Unpaid leave
= Net pay
```

Employer cost is a separate figure and is the one that matters for your P&L: gross pay plus the employer shares of EPF, SOCSO and EIS, plus foreign worker levy where it applies. **The levy cannot be deducted from the worker's wages** — the employer bears it.

### 8.4 Statutory rates

Build these as an editable rate table, never hardcoded. They change, and when they do you want to edit a setting rather than pay a developer.

| | Employee | Employer |
|---|---|---|
| EPF — Malaysian, under 60, wages up to RM 5,000 | 11% | 13% |
| EPF — Malaysian, under 60, wages above RM 5,000 | 11% | 12% |
| EPF — aged 60 to 75 | 0% | 4% |
| EPF — foreign workers | 2% | 2% |

Two things that catch people out:

- **EPF became mandatory for foreign workers from October 2025 wages**, at 2% each side. It used to be optional. Applying the standard 13% employer rate to foreign staff is a common error, and so is skipping them entirely.
- **Below RM 20,000 monthly wages, EPF uses the Third Schedule's exact ringgit amounts, not a raw percentage.** A straight multiplication will be a ringgit or two off, every month, for every employee. Use the table.

SOCSO and EIS run on a wage ceiling of RM 6,000. PCB follows LHDN's schedule.

### 8.5 Outputs

- Payslip per employee per month, showing gross, each deduction itemised, advance repayment, and net
- Monthly payroll summary for the owner
- Bank transfer listing for salary payment
- Statutory contribution summaries for EPF, SOCSO, EIS and PCB submission
- Advance ledger per employee, for the year

### 8.6 The scope decision you need to make

There are two very different products hiding in this section, and picking the wrong one is the main way this project gets expensive.

**Option A — advance and net pay tracking only.** You record each employee's agreed salary, their advances, and what you actually paid them. The system tracks balances and posts the cost to your accounts. It does not calculate EPF, SOCSO, EIS or PCB. Small build, no compliance risk, solves the problem you described.

**Option B — full statutory payroll.** The system calculates every deduction, produces compliant payslips and generates submission files. Much larger build, and the rate tables need maintaining every time the government changes something. Get a calculation wrong and the exposure is real — fines under the EPF Act, and unhappy staff.

My recommendation is **Option A now**, paired with an off-the-shelf payroll service if you want full compliance. Payroll is a solved problem sold cheaply by people who maintain the rate tables for a living. Your competitive problem is the night report and the cash drawer, not calculating EPF. But it's your call, and question 19 is where you make it.

---

## 9. Reminders and the task list

Yes — and the design decision here matters more than the feature itself.

### 9.1 Derive the list, don't maintain it

A to-do list you have to remember to fill in is a to-do list that stops being true within a month. Someone forgets to add the supplier bill, the list looks clear, and you miss the payment anyway. Worse, once it's been wrong twice, people stop trusting it and go back to memory.

**So the task list is mostly generated, not typed.** The system already knows almost everything you need reminding about, because you recorded it for other reasons:

| The system already knows | So it can tell you |
|---|---|
| Supplier invoices and due dates (7.4) | What to pay, and when |
| Guest invoices issued and terms (6.3) | Who owes you and is overdue |
| Advance repayment schedules (8.2) | What to deduct this payroll |
| Work permit and FOMEMA expiries (8.1) | What's expiring in 60 days |
| Night reports submitted or missing (5.1) | Which days still need approving |
| Recurring expenses (5.2) | Rent and utilities coming up |

Nothing on that list needs a human to remember it. A manual task — "call the aircon man about room 12" — is the small extra layer on top, not the foundation.

### 9.2 Recurring obligations

These repeat on a fixed schedule and can be generated a year ahead. Set them once when the system is configured.

**Monthly**

| Obligation | Timing |
|---|---|
| Staff salaries | Employment Act requires wages paid no later than the seventh day after the end of the wage period |
| EPF, SOCSO, EIS, PCB | By the 15th of the following month, all four together |
| HRD levy, if you're registered | Also the 15th |
| Rent, utilities, internet, licences | Your own dates |
| OTA commission invoices | Usually early in the month |

**Bi-monthly**

SST-02 return, if you're SST registered, by the last day of the month following each taxable period. Due even when there's nothing to pay.

**Annual**

| Obligation | Timing |
|---|---|
| Form EA to each employee | By the last day of February |
| Form E to LHDN | End of March, and required even with no employees |
| Business licence, fire certificate, insurance, permits | Your own renewal dates |

The 15th is the important one. EPF, SOCSO, EIS, PCB and HRD levy all land on the same date, penalties start immediately, and late EPF carries criminal exposure under the EPF Act, not just a fine. That single monthly reminder is probably worth more than the rest of the module combined.

*Confirm all dates with your accountant — they change, and this is a design document, not tax advice.*

### 9.3 Bills that repeat every 3 or 6 months

The quarterly and half-yearly ones are exactly where memory fails, because they come round rarely enough that nobody has a habit around them. Fire extinguisher servicing, insurance, pest control, licence renewals, some maintenance contracts.

**The schedule record**

| Field | Notes |
|---|---|
| Name | "Fire extinguisher servicing" |
| Supplier | Linked to the supplier record where there is one |
| Category | Same expense list as everywhere |
| Frequency | Monthly, every 2 months, quarterly, every 6 months, yearly, or every *n* months |
| First due date | Every future date is computed from this anchor |
| Expected amount | Marked as fixed or estimated |
| Remind me | Days before due. **7 by default**, 30 for renewals |
| Assigned to | Usually the owner |
| Runs until | A date, or indefinitely |

**Generate occurrences, don't just store a next-due date.** The system should create twelve months of individual dated occurrences ahead, each with its own status: Upcoming → Reminded → Bill received → Paid → Skipped. A single "next due" field cannot tell you that the March quarter was paid and the June one wasn't. Separate rows can.

**Month-end edge case.** A bill anchored on the 31st has no 31st in February. Rule: fall back to the last day of that month. Decide it once and apply it everywhere, or you'll get bills quietly landing on the 3rd of the following month.

**Weekend and holiday handling.** For statutory deadlines landing on a non-working day, the practical deadline moves *earlier*, not later — EPF's guidance is to pay by the last working day before. Reminders should follow that. And Malaysian public holidays vary by state, so the calendar needs to know you're in Selangor and not Penang.

**The reminder is not the expense.** A schedule tells you a bill is coming. It does not create a cost. When the real bill arrives you record it as a purchase invoice (7.4) with its actual amount and date, and the occurrence links to it. Skip this and you'd be booking costs for bills that never came, then booking them again when they did.

**Expected against actual.** Because the schedule holds an expected amount, the system can flag when the real bill differs materially — the quarterly pest control that was RM 450 for two years and is suddenly RM 800. That flag is one of the more quietly valuable things in this module.

**Skipping.** An occurrence can be skipped with a reason without touching the schedule. Editing a schedule affects future occurrences only — anything already paid is history and doesn't move.

### 9.4 What quarterly bills do to your monthly profit

A RM 3,600 half-yearly insurance premium paid in March makes March look terrible and the other five months look better than they were. Nothing about the business changed.

Two ways to handle it:

**Simple, and what I'd suggest:** keep the books on actual payment, and have the monthly report show a separate line for one-off and periodic items. You see the swing and you see what caused it, in one glance, with no extra machinery.

**Proper:** spread the cost across the months it covers — RM 600 a month for six months. This is accrual accounting and it gives genuinely comparable months. The cost is that your profit report and your cash report now disagree, and explaining that to anyone who isn't an accountant is harder than it sounds. If you want it, put a "spread over *n* months" flag on the schedule, and only turn it on for the handful of large periodic items where it actually matters.

**Cash forecast.** Since the system knows every future due date, it can show what's coming: cash on hand, plus expected collections, minus scheduled payments, over the next 30, 60 and 90 days. For a hotel with lumpy quarterly bills this is the number that prevents the unpleasant surprise. Keep the display simple — what's due by week, with a running balance.

### 9.5 What a task looks like

| Field | Notes |
|---|---|
| Title | Generated or typed |
| Type | Bill payment / statutory / renewal / collection / approval / manual |
| Due date | |
| Amount | Where there is one |
| Linked record | The supplier invoice, employee, or guest account it came from |
| Assigned to | Owner or reception |
| Status | Open / Done / Dismissed |
| Completed by, when | |

**Generated tasks close themselves.** Record the payment against a supplier invoice and its task disappears. A task you can tick without doing the underlying thing is a task that will get ticked without the thing being done.

### 9.6 How it reaches you

- **In the app**: a "Due this week" panel as the first thing the owner sees on login, and a smaller one for reception showing only their items
- **Overdue is visually distinct** from upcoming, and counts up so a two-week-overdue bill looks worse than a one-day one
- **Email or WhatsApp digest** each morning, if you want it — one message listing what's due, not one message per task

**A word on notification volume.** The fastest way to kill this feature is to send too much. One digest a day, plus an alert only for something genuinely urgent, beats a stream of pings that get swiped away unread. Let the owner set how many days ahead a bill starts appearing — seven is a reasonable default, thirty for permit renewals.

### 9.7 Reception's version

Reception sees a short, blunt list: submit tonight's report, DOs waiting to be matched, guests checking out with an unpaid balance. They do not see what the hotel owes suppliers or when salaries are due.

---

## 10. Data model (first cut)

| Table | Holds |
|---|---|
| `users` | Login, name, role, active |
| `properties` | If more than one hotel |
| `business_days` | Date, status, opening float, closing cash, variance, submitted by, approved by, timestamps |
| `revenue_lines` | Day, category, amount |
| `collections` | Day, channel, amount, settlement status |
| `expenses` | Day, category, amount, payee, paid by, capital flag, receipt file |
| `accounts` | Monthly guests and companies, incl. tax identifiers |
| `charges` | Account, date, description, amount, invoice reference once billed |
| `invoices` | Number, account, period, subtotal, tax, total, status |
| `invoice_lines` | Invoice, description, qty, rate, amount |
| `payments` | Invoice, date, amount, method, reference |
| `suppliers` | Vendors, incl. tax identifiers and payment terms |
| `purchase_invoices` | Supplier, their invoice number, dates, category, capital flag, tax, total, status, attachment |
| `purchase_invoice_lines` | Invoice, description, qty, unit price, amount |
| `supplier_payments` | Invoice, date, amount, method, reference |
| `delivery_orders` | Supplier, date, items, received by, matched invoice |
| `floats` | Cash floats issued to reception or the kitchen: holder, amount, top-ups, acquittals |
| `owner_transactions` | Date, amount, direction, source of cash, purpose, note, running balance |
| `employees` | Staff records, incl. statutory numbers and permit expiries |
| `advances` | Employee, date, amount, reason, source of cash, approver, repayment plan, outstanding balance |
| `advance_repayments` | Advance, payroll run, amount deducted |
| `payroll_runs` | Month, status, totals, run by, paid date |
| `payroll_lines` | Run, employee, gross, each deduction, advance repayment, net |
| `statutory_rates` | Editable EPF, SOCSO, EIS bands with effective dates |
| `categories` | Editable lists for revenue and expense |
| `tasks` | Title, type, due date, amount, linked record, assignee, status, completed by and when |
| `recurring_obligations` | Name, supplier, category, frequency, anchor date, expected amount, reminder lead days, spread flag, active until |
| `obligation_occurrences` | Schedule, due date, expected amount, status, linked purchase invoice, skip reason |
| `holidays` | Public holiday calendar by state, for deadline shifting |
| `notification_settings` | Per user: channel, digest time, how many days ahead to warn |
| `audit_log` | Every create, edit, delete, approval — user, timestamp, before and after values |

The audit log is not optional. A cash-handling system without one is an argument waiting to happen.

---

## 11. Permissions

| Action | Reception | Main account |
|---|---|---|
| Submit night report | Yes | Yes |
| Edit a submitted day | No | Yes, logged |
| Approve a day | No | Yes |
| Record petty cash expense | Yes, under limit | Yes |
| Record bank or salary expense | No | Yes |
| Post charge to account | Yes | Yes |
| Reverse a charge | No | Yes |
| Create or void invoice | No | Yes |
| Record payment received | No | Yes |
| View monthly profit | No | Yes |
| View past months | No | Yes |
| Manage users and categories | No | Yes |
| Record a delivery order when goods arrive | Yes | Yes |
| Enter a supplier invoice | No | Yes |
| Pay a supplier | No | Yes |
| See what the hotel owes suppliers | No | Yes |
| See employee list (names, positions) | Yes | Yes |
| Pay out an approved advance from the drawer | Yes | Yes |
| Approve an advance | No | Yes |
| See salary figures or advance balances | No | Yes |
| Run payroll | No | Yes |
| Record cash handed to the owner from the drawer | Yes | Yes |
| See owner drawings history or balance | No | Yes |
| See own task list | Yes | Yes |
| See payment and statutory reminders | No | Yes |
| Create a manual task for someone else | No | Yes |

---

## 12. Practical requirements

- **Phone-first for reception.** The night report will be filled in on a phone or a small counter screen. It must work there, not just on a laptop.
- **Poor internet tolerance.** If the connection drops mid-report, the entry must not vanish. Save drafts locally and sync when it returns.
- **Fast entry.** Sensible defaults, remembered categories, a number pad for amounts. If the night report takes more than five minutes, staff will start guessing at the figures.
- **Backup.** Automatic daily export, plus a manual download. Data you cannot get out of a system is data you don't really own.
- **PDPA.** You will be holding guest IC and passport numbers. Store only what you need, restrict who can see it, and set a deletion period.
- **Bilingual labels** if any of your staff are more comfortable in Malay.

---

## 13. Suggested build order

**Phase 1 — the night report and daily review.**
Two logins, night report submission, cash reconciliation with variance, petty cash expenses, owner approval, monthly summary, CSV export. This alone solves most of what you described and is worth having in production before anything else is built.

**Include the employee list and advances here, not later.** An advance paid from the drawer is a cash movement, and Phase 1 cannot balance the drawer without it. The employee list at this stage is just names, positions, and an advance balance — no salary figures, no statutory calculation.

**Owner drawings belong in Phase 1 too**, for the same reason: cash taken from the drawer has to be accounted for or the count won't balance. At this stage it's a simple in/out log with a purpose field and a running balance.

**Phase 2 — monthly guests and invoicing.**
Accounts, charge posting, invoice generation with PDF, payment recording, receivables aging. Capture e-Invoice fields here.

**Suppliers and purchase invoices fit here too.** The two halves share most of their machinery — a party record with tax identifiers, a document with lines and a total, payments against it, and an aging report. Building them together is meaningfully cheaper than building them apart.

**Reminders arrive with Phase 2, not before.** The task list is mostly derived from due dates, and until supplier invoices exist there's very little for it to derive. The exception is the recurring statutory list — the 15th, salary day, permit expiries — which is a small standalone build and worth having early since it doesn't depend on anything else.

**Phase 3 — the owner's back office.**
Non-desk expenses, recurring expenses, bank reconciliation, full reporting suite, occupancy and ADR trends. Full salary calculation belongs here too, if you decide to build it at all.

**Phase 4 — integrations.**
MyInvois submission. Possibly pulling room and revenue figures from iHotel automatically, if the vendor allows API or database access — worth asking them in writing, since some void support if you touch the database.

---

## 14. Open questions

These need your answers before the design can be finalised.

**Operation**
1. When does your business day start and end?
2. How many rooms, and how many properties?
3. How many reception staff, and do they work separate shifts with separate cash floats — or one float across the day?
4. Does reception bank the cash in daily, or does the owner collect it?
5. What is a reasonable petty cash ceiling for reception without approval?

**Kitchen**
5a. Is the daily cooking for staff, for guests, or both?
5b. Who buys the food, and do they take cash from reception each morning or hold a float?
5c. How many staff eat each day, and do you also pay cash meal allowance to anyone?

**Money**
6. Which payment channels do you actually accept today?
7. Roughly what share of bookings come through OTAs, and which ones?
8. Are you SST registered?
9. Do you collect tourism tax from foreign guests?
10. What's your annual turnover band? This decides your e-Invoice deadline.
10a. Is the hotel a sole proprietorship, partnership, or Sdn Bhd? This changes how owner drawings must be treated — see 5.4.
10b. Do you also put your own money into the business when cash is tight?

**Monthly guests**
11. How many long-stay or corporate accounts, roughly?
12. What credit terms do you give them?
13. Are you invoicing them today, and if so, how — Word, Excel, iHotel?

**Suppliers**
13a. How many regular suppliers bill you on credit, and what terms do they give?
13b. Do any of them deliver on a DO and invoice at month end?
13c. Do you rent your building from an individual rather than a company? This triggers self-billed e-Invoice — see 7.7.

**Staff**
14. How many employees, and how many are foreign workers?
15. Are you registered with EPF, SOCSO and EIS, and do you currently run payroll on anything — software, Excel, or by hand?
16. Do you pay salaries in cash or by bank transfer? What day of the month?
17. Do you distribute a service charge to staff?
18. How often do advances actually happen, and are they usually paid from the front desk drawer or by you directly?
19. **Do you want the system to calculate statutory deductions, or only to track gross, advance, and net?** This is the biggest single scope decision in the whole project — see 8.6.

**Reminders**
19a. How do you want to be told — in the app, email, or WhatsApp?
19b. Are you registered for SST and HRD levy? Both add recurring deadlines.
19c. What licences and certificates does the hotel renew each year, and when?
19d. Which bills come quarterly or half-yearly, and roughly how much? These are the ones worth loading into the system on day one.

**System**
20. Does iHotel produce a daily report reception can read the room figures from?
21. Have you asked the vendor about API or database access?
22. What device will reception use — their own phone, a shared tablet, a desktop?
23. Who is building this — you, an in-house developer, or an agency?
24. What's your budget and target date?

---

## 15. What I'd flag before you commit

**Don't build what you can buy.** Several Malaysian systems already do hotel accounting with e-Invoice built in. Building your own makes sense if your workflow is genuinely unusual, if you want to own the data, or if quoted prices are worse than the build cost — but it's worth pricing the alternatives before starting.

**The riskiest part isn't the software.** It's whether reception fills the report in honestly and consistently at 1am when they're tired. Design for that: short form, obvious fields, no free-text where a dropdown will do, and a variance figure the owner reviews every single day for the first month so staff learn it's actually being watched.

**Start smaller than feels right.** Phase 1 in production, used daily for a month, will teach you more about what you actually need than another three rounds of specification.
