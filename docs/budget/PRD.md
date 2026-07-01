# Product Requirements Document — "SafeSpend" (working name)

**Version:** 0.2 — expanded from "budgeting app" to **personal financial operating system**
**Owner:** crashoveride116@yahoo.com
**Status:** Draft for review

---

## 1. Vision

Not another budgeting app. A **personal financial operating system** — advisor, coach,
planner, and decision-making assistant in one — whose job is to **remove uncertainty
from personal finances** with clear, personalized, explainable guidance every day.

The app must be able to answer, at any moment:

- Can I afford this today?
- How much can I safely spend today?
- What should I do with my money next?
- Am I on track?
- What happens if I make this purchase?
- What is the smartest financial decision right now?

The experience should feel like a trusted financial coach in your pocket.

### Product principles

1. **One number first.** *Safe to Spend Today* is the centerpiece. Everything else is
   an input to it or an explanation of it.
2. **Explain everything.** Every number, score, recommendation, and forecast can be
   expanded into "why," grounded in the user's real data. No black boxes.
3. **Coach, never shame.** Forward-looking, quantified, encouraging. "Skip this and you
   hit your goal 5 days sooner" — never "you overspent again."
4. **Deterministic core, conversational shell.** All money math (engine, score,
   forecast, simulations) is deterministic, tested code. AI narrates, phrases, and
   orchestrates — it never invents a number. (Architecture ADR-6.)
5. **Trust through automation.** Data syncs itself; manual entry is a correction
   mechanism, not a chore.
6. **Conservative by default.** Uncertainty rounds *against* spending. Safe-to-Spend
   never overpromises; a missed bill caused by the app is the unforgivable failure.
7. **Simple surface, deep system.** The interface leads with the most important thing
   and explains why — not dozens of charts.

### Why this wins

YNAB, Monarch, and Copilot Money report the past. Nothing mainstream answers the
question people ask *before* acting: "Can I afford this right now, and what happens if
I do?" This app's identity is **decision support**: a dynamic daily number, a purchase
verdict with impact analysis, GPS-style arrival dates for goals, and a copilot that
answers money questions from real data.

---

## 2. Personas

- **P1 — The Owner (v1 target):** multiple banks, cards, loans. Knows budgeting theory,
  fails at execution due to daily uncertainty. Wants automation and answers.
- **P2 — Future users:** couples/families, irregular incomes, debt-payoff optimizers.
  Not built for yet; never blocked by the data model (user scoping everywhere,
  household concept reserved).

---

## 3. Feature requirements

Layered like an OS: **data layer → intelligence layer → guidance layer.** Each layer
only depends on the ones below it.

### 3.1 Data layer (the facts)

| ID | Feature | Requirement |
|----|---------|-------------|
| D1 | Account aggregation | Connect checking, savings, credit cards, loans, investments via Plaid Link (provider-pluggable). Multiple institutions. |
| D2 | Transaction sync | Webhook-driven near-real-time; daily sweep minimum; manual refresh. Idempotent, cursor-based. |
| D3 | Auto-categorization | Tiered: learned user rules → Plaid categories → AI fallback → review queue. Corrections create rules (the learning loop). |
| D4 | Recurring detection | Detect income streams and bills/subscriptions with predicted amount + next date; user confirms/edits/dismisses. |
| D5 | Balances & liabilities | Available vs. current balances; card minimum payments and due dates; loan details. |

### 3.2 Intelligence layer (deterministic computation)

| ID | Feature | Requirement |
|----|---------|-------------|
| I1 | **Daily Spending Engine** | *Safe to Spend Today*, recomputed on every transaction, bill, goal, setting change, and day rollover. Full spec §4. |
| I2 | **Cash Flow Forecast** | Day-by-day projected balances over 7/30/90/365 days: paychecks, bills, card payments, savings transfers, predicted discretionary spend. Spec §7. |
| I3 | **Financial Health Score** | 0–100 composite of 8 sub-scores (cash flow, savings, debt, emergency fund, spending discipline, bills, goal progress, net-worth trend). Every change explained. Spec §8. |
| I4 | **Goal GPS** | Every goal has a live **estimated arrival date** derived from the forecast; dates move automatically with every spend/save. Spec §6. |
| I5 | **Scenario engine** | Generalized simulations: one-off purchase, recurring change (±retirement, ±debt payment), income shock (job loss N months), windfall. Runs the forecast with/without the scenario. Spec §9. |
| I6 | Subscription analysis | Recurring outflows ranked with monthly + annual cost, price-change detection, usage recency → Keep / Review / Cancel recommendation. |

### 3.3 Guidance layer (what the user sees)

| ID | Feature | Requirement |
|----|---------|-------------|
| G1 | **Daily Briefing** | Every morning (user timezone): health score, Safe-to-Spend, checking balance, upcoming bills, goal status, emergency fund %, and **one recommendation with its reason** ("Spend freely within today's limit" / "Avoid unnecessary spending — electric, insurance, and Visa are due before your next paycheck"). In-app always; email/push opt-in. |
| G2 | **Purchase Intelligence** | "Can I afford this?" → verdict (Yes / Tight / Not now) + impact list (bills coverage, emergency fund, goal date deltas, new daily allowance) + risk level. Powered by I5. |
| G3 | **Financial Copilot** | Natural-language Q&A over the user's real data: "What should I do with my next paycheck?", "Debt or savings?", "Why did my number change today?" Anthropic API + tool-use over the intelligence layer. Spec §10. |
| G4 | Coach insights | Evidence-based behavioral nudges: "You usually spend more on Fridays," "Restaurant spending +18% over 3 months — at this pace you'll miss the Christmas goal by $140," "Grocery spending has improved every month this year." Max 2–3 active; dismissible. |
| G5 | **Financial Calendar** | Month view of dated cash events (paychecks, bills, transfers) with projected running balance — the forecast made visual. |
| G6 | Dashboard | One screen: the briefing/number + one-tap "why" for everything. |

### 3.4 Platform

| ID | Feature | Requirement |
|----|---------|-------------|
| P1 | Auth & security | Email+password (bcrypt), httpOnly sessions, AES-256-GCM-encrypted aggregator tokens, secrets never client-side or logged. |
| P2 | Responsive PWA | Mobile-first; dark mode from day one. |
| P3 | Product-grade foundations | Per-user data isolation, Zod-validated API, audit snapshots — single user now, multi-user-ready always. |

### 3.5 Long-term backlog (explicitly not in v1 scope)

Net worth dashboard & trend detail, debt payoff optimization (avalanche/snowball),
retirement forecasting, tax planning, family/shared budgeting, budgeting styles
(zero-based, envelope, 50/30/20, custom), savings challenges, milestones/achievements,
exportable reports, spending alerts push infrastructure, investment detail views.

### 3.6 Non-goals (v1)

No money movement of any kind (read-only). No investment trading/advice. No native
mobile apps (PWA). No multi-currency (store codes anyway). The copilot gives
*decision support grounded in the user's data*, not regulated financial advice — a
persistent, honest disclaimer, and it never recommends specific securities.

---

## 4. The Daily Spending Engine (the centerpiece)

### 4.1 Contract

```
SafeToSpendToday = discretionary money spendable today without missing a bill,
                   a debt payment, a goal contribution, or the emergency reserve,
                   between now and the next expected income.
```

Inputs: checking/cash balances (savings opt-in), credit card balances & minimums,
upcoming bills and recurring expenses, income schedule, debt payments, goal
contributions, emergency fund requirement, and the forecast (I2) as a sanity check —
if the forecast dips below the floor on any day this period, Safe-to-Spend clamps down
so the dip is prevented, not just reported.

### 4.2 Formula (v1)

```
period            = now → next expected paycheck (fallback: end of month)
daysLeft          = days remaining in period, inclusive of today

availableCash     = Σ available balances of opted-in spending accounts
obligations       = unpaid bills & recurring expenses due in period
                    + card minimum payments due in period
                    + planned one-offs in period
goalReserve       = scheduled goal contributions in period
emergencyFloor    = user-defined cash cushion (default $500)

discretionaryPool = max(0, availableCash − obligations − goalReserve − emergencyFloor)
safeToSpendToday  = discretionaryPool / daysLeft − spentToday(discretionary)
                    then clamped by forecast-dip check (§4.1)
```

Rules: pending transactions count immediately · credit card discretionary purchases
count at swipe time, not statement time · underspend rolls forward (the number rises
when you behave) · overspend redistributes across remaining days with an explanation ·
a negative pool renders as **$0 + recovery plan**, never a bare negative number.

### 4.3 Explainability

Every computation persists a **snapshot** (inputs, ordered line items, result, trigger)
so the UI renders an exact decomposition and "why did my number change since yesterday?"
is answered by diffing two snapshots — which is also precisely what the copilot cites.

### 4.4 Recompute triggers

Transaction add/edit/remove · balance update · bill/stream change · goal change ·
settings change · local-midnight rollover · manual refresh.

---

## 5. Daily Briefing (G1)

Assembled every morning from already-computed artifacts — briefing generation does no
new math:

```
Good morning.
Financial Health: 91/100          (▲2 — emergency fund crossed 70%)
Safe to Spend Today: $47.83
Checking: $2,138 · Upcoming bills: $782
Savings goals: on track · Emergency fund: 74%

Today's recommendation:
Spend freely within today's limit.
```

The **recommendation** comes from a deterministic rule tree (pool health, bill density
before payday, forecast dips, goal pace), each rule carrying its own reason string.
v1 is template-phrased; later the copilot rephrases the same facts more naturally.
Recommendations are always explainable ("because electric, insurance, and Visa are due
before your next paycheck") and never contradict the engine.

## 6. Goal GPS (I4)

Every goal shows **% complete** and an **estimated arrival date** — like GPS ETA:

```
Emergency Fund   78%   ETA Oct 4
House Down Pmt   41%   ETA Mar 2029
Vacation         65%   ETA Sep 12
```

ETA = first forecast day where projected funded amount ≥ target, given scheduled
contributions plus the trailing surplus trend. Every engine recompute refreshes ETAs;
material moves (>2 days) produce a coach insight ("Skipping that purchase moved
Vacation 5 days closer"). ETA history is stored — the sparkline of an ETA converging
is the single most motivating chart in the app.

## 7. Cash Flow Forecast (I2)

Deterministic day-by-day ledger projection over 7/30/90/365 days:

```
balance(d+1) = balance(d) + expectedInflows(d) − scheduledOutflows(d)
                          − predictedDiscretionary(d)
```

- Inflows/outflows from confirmed recurring streams + liabilities due dates + planned
  one-offs; discretionary from trailing 90-day daily median (weekday-adjusted later).
- Output: dated series of projected balances + event markers; **minimum-balance day**
  highlighted ("lowest point: $312 on Jul 14 — after rent, before payday").
- Powers: the calendar (G5), goal ETAs (§6), the engine's dip-clamp (§4.1), scenario
  comparisons (§9), and briefing warnings. One forecast implementation, five consumers.
- 12-month view is explicitly a *trend*, not a promise; confidence fades with horizon
  and the UI says so.

## 8. Financial Health Score (I3)

Composite 0–100, recomputed daily and on material changes; each sub-score 0–100 with a
fixed weight and a **reasons list**:

| Sub-score | Measures (v1 heuristic) | Weight |
|---|---|---|
| Cash flow | trailing 30/90-day inflow vs. outflow ratio | 20% |
| Emergency fund | months of essential expenses covered vs. target | 15% |
| Debt | utilization, minimums covered, debt-to-income trend | 15% |
| Bills | on-time coverage; forecast shows no unfunded bill | 15% |
| Spending discipline | discretionary spend vs. allowance adherence, 30 days | 15% |
| Savings rate | savings + goal contributions as % of income | 10% |
| Goal progress | goals on pace (ETA ≤ target date) | 5% |
| Net-worth trend | 90-day slope of assets − liabilities | 5% |

Score changes always carry attribution: "91 → 89: Visa utilization crossed 30%."
Daily snapshots stored for the trend line. Weights/heuristics are config, not code —
they will be tuned with lived experience.

## 9. Scenario engine (I5)

One abstraction: a **scenario** = a set of deltas applied to forecast inputs —
`one_off` (buy the $600 TV) · `recurring_change` (+$150/mo retirement, +$200/mo car
payment) · `income_shock` (no paycheck for 3 months) · `windfall` (+$5,000).
Run forecast + engine + goal ETAs + health score with and without; return the diff:
new daily allowance, goal date deltas, minimum-balance day, emergency-fund impact,
and a risk level (`low / moderate / high`) from deterministic thresholds (post-purchase
floor coverage, bill coverage, goal slippage). Purchase Intelligence (G2) is simply a
one-off scenario with a verdict rendering. Simulations never write to real data;
"I bought it" logs a planned transaction reconciled on sync.

## 10. Financial Copilot (G3)

Conversational interface over everything above, via the Anthropic API:

- Claude with **tool use**: `get_safe_to_spend`, `get_snapshot_diff`, `get_forecast`,
  `get_health_score`, `get_goals`, `get_transactions_summary`, `run_scenario`,
  `get_recurring`, `get_insights`. The model orchestrates tools and explains results.
- **Grounding rule (hard):** every figure in an answer must come from a tool result.
  The copilot never computes money math in prose; "Can I afford X?" always calls
  `run_scenario`. Answers cite their sources ("based on today's snapshot and your
  July forecast").
- Read-only in v1: the copilot proposes ("Want me to set that as a goal?") and deep-
  links to the screen; it does not mutate data until a later, explicitly-confirmed
  action framework.
- Safety: persistent "decision support, not licensed financial advice" framing; no
  security recommendations; refuses out-of-scope (tax filing specifics) gracefully
  toward the backlog features.

---

## 11. Success metrics

- **Trust:** zero missed bills / overdrafts attributable to app guidance (hard requirement).
- **Habit:** opened ≥5 days/week; briefing read-rate as the north-star engagement metric.
- **Accuracy:** ≥90% auto-categorization after 30 days; forecast 7-day balance error
  within ±10% (tracked from day one — this is what makes the copilot honest).
- **Freshness:** data ≤24h old always, ≤1h with webhooks.
- **Speed:** dashboard number in <1s from snapshot; copilot first token <2s.

## 12. Constraints & risks

| Risk | Mitigation |
|------|-----------|
| Plaid production cost/approval | Sandbox-first; `BankProvider` interface keeps Teller/SimpleFIN/manual CSV as alternates (ARCHITECTURE §4). |
| LLM hallucinating numbers | Tool-grounding rule + deterministic core; copilot answers are assembled from tool results, and eval fixtures assert no un-sourced figures. |
| Forecast wrong → user trusts it too much | Conservative discretionary estimate, confidence framing at long horizons, tracked forecast error, floor clamp on the engine. |
| Score/recommendation feels arbitrary | Every score delta and recommendation carries machine-generated attribution from real inputs. |
| Scope explosion (it's an OS now) | Layered requirements (§3): data → intelligence → guidance; each milestone ships one usable slice (ROADMAP). |
| Bank token security | AES-256-GCM at rest, server-only, never logged. |
| Engine bug → overdraft | Pure-function engine, golden tests, snapshot audit trail, emergency floor margin. |
