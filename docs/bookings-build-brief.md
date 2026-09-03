# Bookings and reservation letters — build brief

Direct reservations taken by phone or walk-in, with payment tracking and a flexible confirmation letter.

Read `docs/spec.md` §3 and `CLAUDE.md` before starting. Show the plan before writing code.

---

## 1. Three accounting rules that shape everything

These are not preferences. Getting any of them wrong produces figures that look plausible and are wrong.

**Tourism tax is a liability, never revenue.** RM 10 per room per night from foreign guests is collected on behalf of the government and remitted to LHDN. On a 15-night stay that is RM 150 of a RM 1,350 total. If it lands in revenue, profit is overstated and there is no record of what is owed onward. It needs its own field, its own total, and exclusion from revenue everywhere. Reports need a "tourism tax collected" figure for the period so it can be remitted.

**Room revenue accrues per night, not on check-in.** A stay from 30 August to 14 September at RM 80 a night is RM 1,200 — but RM 160 belongs to August and RM 1,040 to September. Booking the whole amount on the check-in date makes one month look strong and the next empty. Any date-range report includes only the nights falling inside that range.

**Payment before the stay is a deposit, not revenue.** RM 1,350 paid on 27 August for a stay starting 30 August is money held, not earned. It converts to revenue night by night as the stay progresses. Until then it is a liability that could be refunded.

---

## 2. Data model

**`bookings`**

| Group | Fields |
|---|---|
| Guest | Name, passport or IC, nationality, email, phone, address, TIN |
| Stay | Check-in, check-out, nights (computed), room type, number of rooms |
| Rate | Rate per night in sen, currency RM |
| Tourism tax | Applicable yes/no, rate per room per night, total (computed) |
| Status | confirmed / checked-in / checked-out / cancelled / no-show |
| Source | direct phone / walk-in / email / OTA |
| Reference | Sequential, gapless, never reused |
| Meta | Created by, created at, notes |

Capture TIN and full address even though e-Invoice submission is not built. Chasing a guest for it after checkout is a bad afternoon.

**`bookingPayments`**

Booking · Date · Amount · Payment method (from `paymentMethods`) · Type (deposit / part payment / full / refund) · Reference · Recorded by

Outstanding balance is computed, never stored.

**`bookingNights`** — or derived on read, whichever is cleaner.

One row per night: booking, date, room revenue in sen, tourism tax in sen. This is what makes monthly splitting work without recalculating a date range every time.

**`letterTemplates`**

Name · Which optional fields to show · Which policy clauses to include · Default remarks text · Created by

---

## 3. The reservation letter

The letter is **a view of the booking, not a copy of it**. Regenerating always reflects current payment status.

**Fixed — always present, not editable**

Hotel header · Guest name · Passport or IC · Stay dates and nights · Billing breakdown with room and tourism tax as separate lines · Total, paid, outstanding · Reference number

**Editable per booking, before generating**

| Field | Notes |
|---|---|
| Addressed to | Blank by default. A company or organisation with its address |
| Purpose / remarks | Free text block — visa wording, embassy requirements, anything the guest asks for |
| Policy clauses | Checkboxes, all included by default |
| Optional fields | Show or hide nationality, phone, email, room type, arrival time |

**Templates.** Save a named set of these choices — "Visa application", "Company booking", "Standard" — and pick one when generating. Manager+ can create and edit them. The last used configuration becomes the default.

**Reprints.** Store the configuration used with the booking. A guest asking for a copy weeks later for a claim or a visa gets a letter matching what was originally issued, not a silently different one.

Output: PDF matching the existing house format — hotel header block, guest and stay details side by side, billing table, summary box, policies. Downloadable and emailable.

---

## 4. Link to the night report

A booking's nightly revenue should flow into that night's figures automatically.

**The rule that prevents the OTA problem repeating:** reception must never type a booking's revenue in twice. Room revenue on the night report should show the same split as the OTA fix — direct revenue typed by reception, plus a computed subtotal from bookings, adding to a clear total.

Tourism tax from bookings appears as its own line in the night report, outside revenue.

State in the plan exactly how nightly accrual interacts with the existing room revenue field before writing any code. This is the part most likely to produce a double count.

---

## 5. Permissions

| | Reception | Manager | Owner |
|---|---|---|---|
| Create a booking | Yes | Yes | Yes |
| View bookings | Yes | Yes | Yes |
| Edit a booking | No | Yes | Yes |
| Cancel a booking | No | Yes | Yes |
| Record a payment | Yes | Yes | Yes |
| Refund a payment | No | Yes | Yes |
| Generate a letter | Yes | Yes | Yes |
| Manage letter templates | No | Yes | Yes |

Server-side on every route and query, as everywhere else.

---

## 6. Open questions

1. Is tourism tax charged per room per night, or per guest per night? The Malaysian rate is per room per night for foreign guests, and the existing confirmation matches that — confirm before building.
2. Is the hotel registered to collect and remit tourism tax? If so, the system should produce the collected total per remittance period.
3. Should a cancelled booking with a deposit keep the deposit, refund it, or vary by case?
4. Do walk-ins get a booking record, or only phone and email reservations?
