# Architecture & Tech Stack

**Status:** Draft for review · Companion to `PRD.md`

---

## 1. Tech stack

We build on the stack already proven in this repo — it happens to be an excellent fit
for this product, and it means zero new infrastructure to learn.

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript end-to-end | One language, shared types between engine/server/client. The Daily Spending Engine's types (obligations, snapshots) are shared verbatim with the UI. |
| Frontend | React 18 + Vite | Already in repo. Fast dev loop; PWA-able for "app on phone" feel without native builds. |
| UI kit | Tailwind + Radix primitives + lucide icons | Already in repo; clean/modern look with full control, accessible primitives. |
| Client state/data | TanStack Query | Already in repo. Perfect for "server is source of truth, refetch on webhook/poll" patterns. |
| Backend | Node + Express 5 | Already in repo. Plaid's Node SDK is first-class. |
| ORM / DB | Drizzle ORM + PostgreSQL | Already in repo. Postgres gives us `numeric` money types, transactional integrity for sync, and JSONB for snapshots/raw payloads. |
| Validation | Zod | Already in repo; every API boundary validated, schemas shared with client. |
| Auth | Email+password (bcrypt) + httpOnly session JWT | Already have the pattern in repo; upgrade to httpOnly cookies for this app. |
| Bank data | **Plaid** behind a `BankProvider` interface | See §4. |
| AI categorization | Anthropic API (`claude-haiku-4-5`) as *fallback tier only* | Cheap, fast; only called for transactions rules can't classify. Behind an interface so it's optional. |
| Scheduling | node-cron in-process (v1) | Daily rollover + daily sync sweep. Swap for a real queue (BullMQ/Redis) only when multi-user. |
| Email | nodemailer (already in repo) | Bill reminders (v1.x). |

**Money is always `numeric(14,2)` in Postgres and integer cents or decimal-string in TS —
never floating point.**

### Explicitly deferred

- Redis/queues, microservices, GraphQL, native mobile, Kubernetes — none earn their
  complexity at 1 user. The seams (provider interface, pure engine, snapshot table)
  are what make them easy to add later.

---

## 2. System overview

```
                ┌──────────────────────────────────────────────┐
                │                 React SPA (Vite)             │
                │  Dashboard · Transactions · Budgets · Goals  │
                │  Plaid Link (client SDK, token exchange only)│
                └───────────────▲──────────────────────────────┘
                                │ HTTPS/JSON (Zod-validated)
┌───────────────────────────────┴──────────────────────────────────┐
│                         Express API                              │
│                                                                  │
│  routes/auth      routes/accounts   routes/transactions         │
│  routes/engine    routes/budgets    routes/goals                 │
│  routes/simulate  routes/webhooks/plaid                          │
│                                                                  │
│  ┌────────────────────┐   ┌────────────────────────────────┐    │
│  │ services/sync      │   │ services/engine                │    │
│  │ Plaid /transactions│──▶│ **Daily Spending Engine**      │    │
│  │ /sync cursor loop, │   │ pure function: inputs → number │    │
│  │ balances, recurring│   │ + line items; snapshot persisted│   │
│  └─────────┬──────────┘   └────────────────────────────────┘    │
│            │              ┌────────────────────────────────┐    │
│  ┌─────────▼──────────┐   │ services/categorize            │    │
│  │ providers/plaid    │   │ tier1 rules → tier2 Plaid PFC  │    │
│  │ implements         │   │ → tier3 AI → uncategorized     │    │
│  │ BankProvider       │   └────────────────────────────────┘    │
│  └────────────────────┘   ┌────────────────────────────────┐    │
│  cron: daily sync sweep,  │ services/insights (rule-based) │    │
│  midnight rollover        └────────────────────────────────┘    │
└───────────────┬──────────────────────────────────────────────────┘
                │ Drizzle
        ┌───────▼────────┐          ┌─────────────────────┐
        │   PostgreSQL   │          │  Plaid API           │
        │  (schema in    │          │  Link / Sync /       │
        │  DATABASE.md)  │          │  Liabilities /       │
        └────────────────┘          │  Recurring / Webhooks│
                                    └─────────────────────┘
```

### Key architectural decisions

**ADR-1: The engine is a pure function.**
`computeSafeToSpend(inputs: EngineInputs): EngineResult` takes plain data (balances,
obligations, goals, settings, dates) and returns the number plus line items. No I/O, no
DB access, no `new Date()` inside — the clock is an input. This makes the most
important code in the product trivially unit-testable ("given this exact situation, the
number is exactly $47.20") and lets the purchase simulator reuse it unchanged: simulation
is just `compute(inputs + hypothetical transaction)` per day over the horizon.

**ADR-2: Every computation is snapshotted.**
`engine_snapshots` stores inputs + line items + result with a trigger reason. This gives
us (a) instant dashboard loads (read latest snapshot, recompute async), (b) the
"why" breakdown for free, (c) an audit trail when the user asks "why did my number drop
$30 overnight?", and (d) history for future forecasting features.

**ADR-3: Bank providers are pluggable.**
A small `BankProvider` interface (`createLinkToken`, `exchangeToken`, `syncTransactions`,
`getBalances`, `getRecurring`, `getLiabilities`) with Plaid as the first implementation.
This de-risks Plaid pricing/approval (Teller, SimpleFIN as alternates) and enables a
`ManualProvider` (CSV import / hand-entered accounts) that also makes local dev and demos
possible without any Plaid account.

**ADR-4: Categorization is tiered, cheapest first.**
1. **User rules** (exact/regex merchant match, learned from corrections) — free, instant,
   personal. Always wins.
2. **Plaid Personal Finance Categories** (comes with every transaction) — free, ~good.
3. **AI fallback** (batched, `claude-haiku-4-5`, structured output mapped to our taxonomy)
   — only for transactions tiers 1–2 can't place confidently.
4. Else `uncategorized`, surfaced in a review queue. Corrections write tier-1 rules.

**ADR-5: Sync is cursor-based and idempotent.**
Plaid `/transactions/sync` with a stored cursor per item; upserts keyed on
`plaid_transaction_id` handle the added/modified/removed lifecycle (pending → posted).
Every sync run ends by re-detecting recurring streams and enqueueing an engine recompute.
Webhook handler verifies signature, records the event, and triggers the same sync path —
so webhook, cron, and manual refresh are one code path.

---

## 3. Core flows

### 3.1 Daily sync (cron + webhook)

```
Plaid webhook (SYNC_UPDATES_AVAILABLE)──┐
cron 6:00 daily sweep ──────────────────┤
user taps "Refresh" ────────────────────┴─▶ syncItem(itemId)
    → /transactions/sync loop with cursor → upsert transactions
    → /accounts/balance refresh → update account balances
    → recurring re-detection → update streams/next dates
    → categorize new transactions (tiered)
    → recompute engine + persist snapshot
    → client refetches (TanStack Query invalidation)
```

### 3.2 Midnight rollover

At user-local midnight, recompute with the new `daysLeft`/`spentToday=0` — this is where
yesterday's underspend visibly rolls into today's number.

### 3.3 Purchase simulation

`POST /api/simulate { amount, category?, date? }` → run the pure engine day-by-day over
the next 30 days twice (with/without the purchase) → return both curves + goal-date
deltas. No DB writes; nothing to un-do.

---

## 4. Bank connectivity: Plaid strategy

### Products used

| Plaid product | Used for | Notes |
|---|---|---|
| **Link** (client SDK) | Account connection UI | Client gets `link_token` from our server; public token exchanged server-side; access token never touches the client. |
| **Transactions (/transactions/sync)** | All transaction data | Cursor-based; handles pending→posted transitions and removals. This is the backbone. |
| **Balance** | Real-time available balance before computing the number | Available vs. current matters: use *available* for cash accounts. |
| **Recurring transactions** | Bootstrap recurring detection | Plaid's `/transactions/recurring/get` gives income + expense streams with predicted next dates; we layer our own detection on top and let the user confirm. |
| **Liabilities** | Credit card due dates + minimum payments, loan details | Feeds `obligations` directly. |
| **Investments (holdings)** | Net-worth only (v1.x) | Never in Safe-to-Spend cash pool. |
| **Webhooks** | Freshness | `SYNC_UPDATES_AVAILABLE`, `DEFAULT_UPDATE`, item error states (`ITEM_LOGIN_REQUIRED` → prompt re-auth via Link update mode). |

### Environment & cost reality

- **Sandbox** (free, fake banks, test webhooks) — all development happens here.
- **Production**: pay-as-you-go; roughly $0.30/connected account/mo for transactions
  plus per-call costs for liabilities/balance — fine for one user (~$5–10/mo), and the
  reason multi-user later needs pricing thought. Production access requires a Plaid
  application/approval process — apply early, develop in sandbox meanwhile.
- Fallbacks if Plaid production is blocked: **Teller** (flat per-enrollment, dev-friendly),
  **SimpleFIN Bridge** (cheap, user-driven), or `ManualProvider` CSV import. The
  `BankProvider` interface exists precisely so this is a swap, not a rewrite.

### Token security

- Plaid `access_token` encrypted at rest with AES-256-GCM; key from `PLAID_TOKEN_KEY` env
  var (32 bytes), never committed. Decrypted only in the provider layer.
- Webhook payloads verified via Plaid's JWT verification header before processing.
- `.env` for secrets; `.env.example` documents required vars without values.

---

## 5. API surface (v1)

```
POST   /api/auth/register | login | logout        GET /api/auth/me
POST   /api/plaid/link-token                      # start Link
POST   /api/plaid/exchange                        # public_token → item, kick first sync
POST   /api/webhooks/plaid                        # signature-verified, no auth cookie
GET    /api/accounts                              # balances, institution, type, sync age
POST   /api/accounts/:id/settings                 # include-in-cash-pool toggle
POST   /api/sync                                  # manual refresh (rate-limited)
GET    /api/transactions?cursor&category&account&search
PATCH  /api/transactions/:id                      # recategorize (+ optional "make rule")
GET    /api/engine/today                          # latest snapshot: number + line items
GET    /api/engine/history?days=30
POST   /api/simulate                              # purchase / savings-rate what-if
GET|POST|PATCH /api/recurring                     # streams: confirm/edit/dismiss
GET|POST|PATCH|DELETE /api/budgets                # category limits
GET|POST|PATCH|DELETE /api/goals                  # savings goals
GET    /api/insights                              # active nudges
GET|PATCH /api/settings                           # emergency floor, payday config, etc.
```

All request/response bodies defined as Zod schemas in `shared/` and imported by both
sides.

---

## 6. Testing strategy

- **Engine:** exhaustive unit tests (vitest) — the pure function makes this cheap.
  Golden scenarios: normal month, payday today, negative pool, overspend redistribution,
  pending transactions, credit-card purchases, goal added mid-period.
- **Sync:** integration tests against recorded Plaid sandbox fixtures (added/modified/
  removed sequences, pending→posted).
- **Categorizer:** fixture corpus of real-ish merchant strings; assert tier precedence.
- **API:** supertest per route, auth + validation failure cases.
- Engine tests are the non-negotiable: a wrong number is the one unforgivable bug (PRD §7).
