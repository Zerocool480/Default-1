# Product Requirements Document — "SafeSpend" (working name)

**Version:** 0.1 (architecture phase)
**Owner:** crashoveride116@yahoo.com
**Status:** Draft for review

---

## 1. Vision

A personal budgeting app whose entire purpose is to answer one question every day:

> **"How much money can I safely spend today without hurting my financial goals?"**

Every feature exists to make that one number accurate, trustworthy, and actionable. The app
is built for a single user first, but architected as a multi-user product from day one
(real auth, per-user data isolation, product-grade security) so it can become a product later.

### Why this wins

YNAB, Monarch, and Copilot are *reporting* tools: they tell you what you spent. Almost
nothing on the market answers the question people actually ask standing in a store:
*"Can I afford this right now?"* The **Daily Spending Engine** is the defining feature —
one dynamic number that changes with every paycheck, bill, purchase, and goal. Everything
else in the app is either an input to that number or an explanation of it.

### Product principles

1. **One number first.** The dashboard leads with Safe-to-Spend. Charts are secondary.
2. **Explain, don't just display.** Every number can be expanded into "why."
3. **Coach, don't shame.** Language is forward-looking ("skip this and you hit your goal
   5 days sooner"), never punitive ("you overspent again").
4. **Trust through automation.** Data syncs itself. Manual entry is a correction
   mechanism, not a requirement.
5. **Conservative by default.** When uncertain (pending transactions, unconfirmed bills),
   the engine rounds *against* the user's spending. Safe-to-Spend must never overpromise.

---

## 2. Personas

- **P1 — The Owner (v1 target):** Has multiple bank accounts, credit cards, and loans.
  Knows budgeting theory but fails at execution because they never know where they stand
  *today*. Wants automation and a daily answer, not another spreadsheet.
- **P2 — Future users (v2+):** Couples/families sharing budgets, people on irregular
  income, debt-payoff optimizers. Not designed for now, but nothing in the data model
  should preclude them (hence `user_id` everywhere, household concept reserved).

---

## 3. Feature requirements

### 3.1 MVP (must-have to be daily-usable)

| ID | Feature | Requirement |
|----|---------|-------------|
| F1 | Bank connectivity | Connect checking, savings, credit cards, loans, and investment accounts via Plaid Link. Multiple institutions per user. |
| F2 | Transaction sync | Automatic sync at least daily; webhook-driven near-real-time when Plaid fires `SYNC_UPDATES_AVAILABLE`. Manual "refresh now" button. |
| F3 | Auto-categorization | Every transaction gets a category automatically (Plaid enrichment → user rules → AI fallback). User can recategorize; corrections create rules the app applies to future matching transactions. |
| F4 | Cash position | Current balance across accounts, split into available vs. pending, with credit utilization shown separately from cash. |
| F5 | Recurring detection | Detect recurring income (paychecks) and expenses (rent, subscriptions, loan payments) with amount + next-date prediction. User can confirm, edit, snooze, or dismiss detected streams. |
| F6 | Budgets & goals | Monthly category spending limits; savings goals with target amount + date; emergency fund reserve floor. |
| F7 | **Daily Spending Engine** | Compute Safe-to-Spend Today continuously (see §4). Recompute on every new transaction, bill change, goal change, or day rollover. |
| F8 | Dashboard | One screen: the number, a one-tap "why" breakdown, today's spend so far, and next 7 days outlook. |
| F9 | Purchase simulator | "What if I spend $X today?" → projected impact on daily allowance, category budgets, and goal dates over the next 30 days. |
| F10 | Auth & security | Email+password with strong hashing, session management, encrypted Plaid tokens at rest, no plaintext credentials ever stored. |

### 3.2 V1.x (fast follows)

- Spending insights/nudges ("70% of restaurant budget used, 12 days left in month").
- Bill reminders (email/push) N days before due.
- Subscription management view (all recurring charges, price-change detection).
- Cash-flow calendar (income/bills plotted on a month view).
- Savings simulator ("$100/week more → house down payment date moves to …").

### 3.3 V2+ (long-term vision, out of scope for initial build)

AI financial coaching (conversational), spending forecasts, net-worth tracking over time,
debt payoff optimization (avalanche/snowball comparison), retirement projections,
custom budgeting methods (zero-based, envelope, 50/30/20), family/shared budgets.

### 3.4 Non-goals (v1)

- No bill *pay* / money movement of any kind (read-only aggregation).
- No investment trading or advice; investment accounts appear in net worth only.
- No native mobile apps; responsive PWA first.
- No multi-currency (USD only in v1; store currency codes anyway).

---

## 4. The Daily Spending Engine (defining feature)

### 4.1 The contract

At any moment, the engine can produce:

```
SafeToSpendToday = discretionary money the user can spend today
                   without missing a bill, a goal contribution,
                   or the emergency reserve, between now and the
                   next expected income.
```

### 4.2 The formula (v1)

```
period            = now → next expected paycheck date (fallback: end of month)
daysLeft          = calendar days remaining in period, inclusive of today

availableCash     = Σ available balances of spending accounts (checking + cash)
                    (savings/investment accounts excluded unless user opts them in)

obligations       = Σ unpaid bills & recurring expenses due within period
                    + credit card minimum payments due within period
                    + user-defined planned one-off expenses in period

goalReserve       = Σ scheduled goal contributions falling within period
emergencyFloor    = user-defined minimum cash cushion (default: $500 or user setting)

discretionaryPool = availableCash − obligations − goalReserve − emergencyFloor
                    (floored at 0)

safeToSpendToday  = discretionaryPool / daysLeft − spentToday(discretionary only)
```

Rules:

- **Pending transactions count immediately** against availableCash (conservative).
- **Credit card discretionary purchases** reduce the pool at purchase time (accrual view),
  not at statement payment time — otherwise cards would hide overspending for a month.
- **Underspend rolls forward:** money not spent today re-enters `discretionaryPool` and
  is re-divided across remaining days (the number gently rises when you behave).
- **Overspend redistributes:** overshooting today lowers every remaining day in the
  period; the app explains this ("today's $40 overage costs you ~$3.30/day until payday").
- **Never negative surprise:** if the pool goes negative, show $0 plus a clear recovery
  plan, not a negative number.

### 4.3 Explainability requirement

The number is only trusted if it can always be decomposed. Every computation persists a
**snapshot** (inputs + line items + result) so the UI can render:

```
Safe to Spend Today: $47.20
  Checking available            +$2,310.00
  Bills before Jul 15 payday      −$980.00   (rent, electric, Spotify)
  Visa payment due Jul 10         −$250.00
  Vacation goal (Jul portion)     −$150.00
  Emergency floor                 −$500.00
  = Discretionary pool             $430.00 ÷ 9 days = $47.78
  Spent today                       −$0.58
```

### 4.4 Recompute triggers

New/modified/removed transaction · balance webhook · bill or recurring stream change ·
goal change · settings change (floor, opt-in accounts) · daily rollover at local midnight ·
manual refresh.

---

## 5. Spending intelligence (coach, not shame)

Rule-based insights in v1 (deterministic, testable), LLM-phrased later:

- Budget pace: "Restaurants: 70% used with 40% of month left."
- Purchase impact (from simulator): "This $89 purchase lowers your daily allowance by
  $9.80 until payday."
- Goal trade-off: "Skip it and your vacation goal lands 5 days sooner."
- Anomalies: duplicate charge, subscription price increase, unusually large transaction.

Tone rules: always forward-looking, always quantified, always dismissible, never more
than ~3 active nudges at once.

---

## 6. Success metrics

- **Trust:** Safe-to-Spend never causes a missed bill or overdraft (hard requirement).
- **Habit:** app opened ≥5 days/week (it's a *daily* answer).
- **Accuracy:** ≥90% of transactions auto-categorized correctly after 30 days of corrections.
- **Freshness:** dashboard data ≤24h old, ≤1h when webhooks fire.
- **Speed:** dashboard renders the number in <1s from cached snapshot.

---

## 7. Constraints & risks

| Risk | Mitigation |
|------|-----------|
| Plaid cost/approval for production | Develop entirely in Plaid Sandbox (free); abstract the provider behind an interface so Teller/SimpleFIN/manual CSV import remain options. |
| Stale or wrong bank data | Show data age on dashboard; conservative pending handling; manual refresh. |
| Paycheck date prediction wrong | User confirms detected income streams; fallback to end-of-month period. |
| Security of bank tokens | Tokens encrypted at rest (AES-256-GCM, key from env), never sent to the client, never logged. |
| Engine bug → user overdrafts | Engine is pure/deterministic with heavy unit tests + snapshot audit trail; emergency floor as safety margin. |
