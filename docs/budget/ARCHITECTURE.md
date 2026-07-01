# Architecture & Tech Stack

**Status:** Draft v0.2 (financial-OS scope) · Companion to `PRD.md`

---

## 1. Tech stack

Built on the stack already proven in this repo — an excellent fit, zero new
infrastructure to learn, and every piece is boring-in-a-good-way.

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript end-to-end | Shared types across engine/forecast/score/client — the intelligence layer's types render directly in the UI and feed copilot tools. |
| Frontend | React 18 + Vite, PWA | Already in repo; mobile-first installable app without native builds. |
| UI | Tailwind + Radix + lucide; Recharts for the few charts | Already in repo; clean/modern, accessible. |
| Client data | TanStack Query | Server is source of truth; invalidate-on-event fits sync-driven UX. |
| Backend | Node + Express 5 | Already in repo; first-class Plaid + Anthropic SDKs. |
| DB | PostgreSQL + Drizzle ORM | `numeric` money, transactional sync, JSONB snapshots. Money is **always** `numeric(14,2)` / decimal-string — never floats, anywhere. |
| Validation | Zod at every API boundary, schemas shared | Already in repo. |
| Auth | bcrypt + httpOnly session cookie | Upgrade of repo's existing pattern. |
| Bank data | **Plaid** behind a `BankProvider` interface | Comparison in §4. |
| AI | **Anthropic API** — `claude-sonnet-5` for the Copilot (tool use), `claude-haiku-4-5` for categorization fallback & briefing phrasing | §5. Behind a `CopilotProvider`/`Categorizer` interface; the app is fully functional with AI disabled. |
| Scheduling | node-cron in-process (v1) | Morning briefing, daily sync sweep, midnight rollover, daily score. Real queue (BullMQ/Redis) only when multi-user. |
| Email | nodemailer (in repo) | Briefing + bill reminder delivery (opt-in). |

Deferred on purpose: Redis/queues, microservices, GraphQL, native mobile, k8s. The
seams below are what make them cheap to add later.

---

## 2. System overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        React PWA (Vite)                            │
│  Briefing/Today · Copilot chat · Calendar · Goals GPS · Activity   │
│  Plan · Simulate · Settings (Plaid Link)                           │
└──────────────────────────▲─────────────────────────────────────────┘
                           │ HTTPS/JSON (Zod)
┌──────────────────────────┴─────────────────────────────────────────┐
│                          Express API                               │
│ ┌──────────────── DATA LAYER ─────────────────────────────────┐    │
│ │ providers/plaid (BankProvider) · providers/manual (CSV/seed)│    │
│ │ services/sync  — cursor loop, balances, liabilities,        │    │
│ │                  webhook + cron + manual = one code path    │    │
│ │ services/categorize — rules → plaid → AI → review queue     │    │
│ │ services/recurring — stream detection, already-paid matching│    │
│ └───────────────┬─────────────────────────────────────────────┘    │
│ ┌───────────────▼─ INTELLIGENCE LAYER (pure, deterministic) ──┐    │
│ │ engine/     computeSafeToSpend(inputs) → number + line items│    │
│ │ forecast/   projectCashFlow(inputs, horizon) → daily series │    │
│ │ score/      computeHealthScore(inputs) → 8 sub-scores+reasons│   │
│ │ goals/      computeETAs(forecast, goals) → arrival dates    │    │
│ │ scenario/   runScenario(deltas) → with/without diff + risk  │    │
│ │        all snapshot-persisted · no I/O inside · clock is arg│    │
│ └───────────────┬─────────────────────────────────────────────┘    │
│ ┌───────────────▼─ GUIDANCE LAYER ────────────────────────────┐    │
│ │ briefing/   morning cron: assemble artifacts + rule-tree rec│    │
│ │ insights/   deterministic behavioral rules (pace, trends)   │    │
│ │ copilot/    Anthropic tool-use loop over intelligence APIs  │    │
│ └─────────────────────────────────────────────────────────────┘    │
│  routes/: auth accounts transactions engine forecast score goals   │
│           simulate copilot briefing recurring budgets insights     │
│           settings webhooks/plaid                                  │
└───────────┬───────────────────────────┬────────────────────────────┘
            │ Drizzle                   │ HTTPS
     ┌──────▼──────┐            ┌───────▼────────┐  ┌───────────────┐
     │ PostgreSQL  │            │  Plaid API     │  │ Anthropic API │
     └─────────────┘            └────────────────┘  └───────────────┘
```

The **layering rule** is the architecture: data layer knows nothing above it;
intelligence layer is pure functions over data-layer state; guidance layer composes
intelligence artifacts and is the only place AI lives. Dependencies point down only.

### Architecture decision records

**ADR-1 — The intelligence layer is pure functions.**
`computeSafeToSpend`, `projectCashFlow`, `computeHealthScore`, `computeETAs`,
`runScenario` take plain data (clock included) and return results + explanations. No
I/O, no DB, no `new Date()`. Consequences: goldenly unit-testable; scenario engine =
same functions with deltas applied; copilot tools = thin wrappers; a wrong number is
reproducible from its snapshot.

**ADR-2 — Every computed artifact is snapshotted.**
`engine_snapshots`, `score_snapshots`, `goal_eta_history`, `briefings` persist inputs +
line items/reasons + result + trigger. Buys: instant dashboard (read latest, recompute
async), the "why" UI for free, "why did it change?" = snapshot diff, forecast-accuracy
tracking, and grounded copilot citations.

**ADR-3 — Bank providers are pluggable.** `BankProvider` (`createLinkToken`,
`exchangeToken`, `syncTransactions`, `getBalances`, `getRecurring`, `getLiabilities`)
with `PlaidProvider` first and `ManualProvider` (CSV/seed) always available — de-risks
aggregator pricing/approval and makes dev/demo work without credentials.

**ADR-4 — Categorization is tiered, cheapest first.** User rules → Plaid PFC → AI
fallback (batched Haiku, structured output) → review queue. Corrections write rules.

**ADR-5 — Sync is cursor-based and idempotent.** `/transactions/sync` cursor per item;
upserts on `plaid_transaction_id` handle pending→posted→removed. Webhook, cron, and
manual refresh share one `syncItem()` path that ends by re-detecting recurring streams
and recomputing the intelligence layer.

**ADR-6 — Deterministic core, conversational shell.**
AI never does money math. The copilot is a tool-use loop whose tools are the
intelligence layer's read APIs plus `run_scenario`; the briefing recommendation comes
from a deterministic rule tree that the LLM may *rephrase* but not alter. Enforced
mechanically: copilot answers are built from tool results, and evals assert no figure
appears without a source tool call. The app functions completely with `AI_ENABLED=false`
(template phrasing, no chat) — AI is a presentation upgrade, not a dependency.

**ADR-7 — One forecast, five consumers.** Calendar, goal ETAs, engine dip-clamp,
scenario diffs, and briefing warnings all read `projectCashFlow` — never their own
projections. Prevents the classic "calendar disagrees with the number" trust-killer.

---

## 3. Core flows

**Sync (webhook / cron 6:00 / manual — one path):** `syncItem` → transactions cursor
loop → balances + liabilities → recurring re-detection → categorize new txns →
recompute engine/forecast/ETAs (+score if material) → snapshots → client invalidation.

**Morning briefing (cron, user-local ~6:30):** ensure fresh sync → read latest
snapshots → rule-tree recommendation → (optional Haiku phrasing pass) → persist
briefing → in-app card + opt-in email/push.

**Midnight rollover:** recompute engine with new `daysLeft`, `spentToday=0`; yesterday's
underspend visibly rolls in; daily score snapshot.

**Copilot turn:** user message → Claude (Sonnet) with tool definitions → tool calls
served in-process from intelligence APIs (all read-only + `run_scenario`) → streamed
answer with figures traceable to tool results → conversation persisted.

**Purchase check:** amount(+category/date) → `runScenario(one_off)` → verdict + impact
+ risk. "I bought it" writes a planned transaction reconciled on next sync.

---

## 4. Aggregator choice: Plaid vs. the field

| | **Plaid** (pick) | MX | Finicity (Mastercard) | Teller | SimpleFIN |
|---|---|---|---|---|---|
| Coverage (US) | ~12k institutions, best-in-class | Strong | Strong | Major banks only | Decent (user-driven) |
| Products we need (txns, balances, liabilities, recurring, investments) | All, mature | Most | Most | Txns/balances (no liabilities product) | Txns/balances |
| Dev experience | Excellent: free full-featured **Sandbox**, first-class Node SDK, Link UI, webhooks | Enterprise sales process | Enterprise sales process | Very good, dev-friendly | Minimal API |
| Access for a solo dev | Self-serve; production requires approval | Hard (sales-led) | Hard (sales-led) | Self-serve | Self-serve |
| Cost (1 user) | ~$0.30/connected acct/mo + per-call; ≈$5–10/mo | Quote | Quote | Flat per-enrollment, free tier | ~$1.50/mo bridge |

**Decision:** Plaid — only self-serve option with the full product set (Liabilities for
card due dates/minimums and Recurring for stream bootstrap matter a lot to us) and a
free sandbox covering the entire dev cycle. MX/Finicity are enterprise-sales-gated:
revisit only at real product scale. Teller is the concrete fallback if Plaid production
approval stalls (flat pricing, great DX — we'd self-detect recurring and lose the
liabilities feed), SimpleFIN the budget fallback, `ManualProvider` the floor. ADR-3
makes any of these a swap, not a rewrite.

**Plaid products used:** Link (client; tokens exchanged server-side, access token never
reaches the browser) · Transactions `/sync` (backbone) · Balance (available vs.
current) · Recurring (`/transactions/recurring/get` bootstraps streams) · Liabilities
(minimums, due dates, APR) · Investments-holdings (net worth later) · Webhooks
(`SYNC_UPDATES_AVAILABLE`, `ITEM_LOGIN_REQUIRED` → Link update mode; JWT-verified).

**Token security:** access tokens AES-256-GCM at rest, key from env (`PLAID_TOKEN_KEY`),
decrypted only inside the provider layer, never logged, never selected by API queries.

---

## 5. Anthropic API integration

Three uses, one principle (ADR-6):

1. **Copilot (Sonnet, tool use, streaming).** Tools (Zod-schema'd, all read-only except
   the side-effect-free `run_scenario`): `get_safe_to_spend`, `get_snapshot_diff`,
   `get_forecast`, `get_health_score`, `get_goals_with_etas`,
   `get_transactions_summary`, `get_recurring`, `get_insights`, `run_scenario`.
   System prompt: coach persona, tone rules, grounding rule, "decision support, not
   licensed advice," refusal boundaries (no securities, no tax filing specifics).
   Server-side loop; per-user rate limits; conversations persisted.
2. **Categorization fallback (Haiku, batched, structured output).** Merchant string +
   Plaid category → our taxonomy id + confidence; below threshold → review queue.
   Merchant names only — no balances or identity data in prompts.
3. **Briefing/insight phrasing (Haiku, optional).** Rewrites template facts warmly;
   numbers arrive pre-computed and a post-check verifies none changed.

Privacy stance: minimum-necessary data per call; summaries/aggregates preferred over
raw transaction dumps in copilot tool results; `AI_ENABLED` kill-switch degrades to
templates. Cost at 1 user: single-digit dollars/month (Haiku batch is fractions of a
cent; copilot Sonnet turns are the bulk).

---

## 6. API surface (v1)

```
POST /api/auth/register|login|logout · GET /api/auth/me
POST /api/plaid/link-token · POST /api/plaid/exchange · POST /api/webhooks/plaid
GET  /api/accounts · PATCH /api/accounts/:id (cash-pool toggle, hide)
POST /api/sync                                   # manual refresh, rate-limited
GET  /api/transactions?cursor&filters · PATCH /api/transactions/:id (+make-rule)
GET  /api/engine/today · GET /api/engine/history · GET /api/engine/diff?from&to
GET  /api/forecast?horizon=7|30|90|365
GET  /api/score · GET /api/score/history
GET|POST|PATCH|DELETE /api/goals · GET /api/goals/:id/eta-history
GET|POST|PATCH /api/recurring                    # confirm/edit/dismiss; subscriptions view
GET|POST|PATCH|DELETE /api/budgets
POST /api/simulate                               # scenario engine
GET  /api/briefing/today · GET /api/briefing/history
GET  /api/insights · POST /api/insights/:id/dismiss
POST /api/copilot/message (SSE stream) · GET /api/copilot/conversations
GET|PATCH /api/settings
```

---

## 7. Testing strategy

- **Intelligence layer (non-negotiable):** golden vitest suites per function — engine
  (payday-today, negative pool, overspend redistribution, pending, credit-at-swipe,
  already-paid dedup, forecast clamp), forecast (known streams → exact series), score
  (attribution correctness), ETAs (contribution + surplus cases), scenarios (all four
  delta types, risk thresholds).
- **Sync:** recorded Plaid sandbox fixtures — added/modified/removed, pending→posted.
- **Copilot:** eval fixtures — canned tool results → assert answers contain only
  sourced figures and correct citations; refusal cases.
- **API:** supertest per route; auth + validation failures.
- **Forecast accuracy telemetry in prod:** nightly compare yesterday's 1/7-day
  projections vs. actuals; stored, charted, and honest.
