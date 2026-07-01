# Build Roadmap

**Status:** Draft for review

Sequencing principle: **the engine is the product**, so it gets built and tested first —
against manual/seed data — before any Plaid wiring. Bank connectivity then upgrades the
inputs from "hand-entered" to "automatic," but the number works from week one. Each
phase ends with something usable.

---

## Phase 0 — Foundation (repo scaffolding)

- [ ] `db/schema/budget/` namespace with Drizzle tables from `DATABASE.md`; migrations run.
- [ ] Auth (register/login/logout, bcrypt, httpOnly session cookie) + `user_settings`.
- [ ] App shell: 5-tab layout, routing, TanStack Query setup, dark mode.
- [ ] Shared Zod schemas package (`shared/`), Vitest wired up.
- [ ] Seed script: demo user + realistic accounts/transactions/streams (this doubles as
      the engine test fixture and the no-Plaid demo mode).

**Exit:** log in, see empty shell, seed data visible in a raw transactions list.

## Phase 1 — The Daily Spending Engine (pure core)

- [ ] `services/engine/compute.ts` — pure `computeSafeToSpend(inputs) → result`
      implementing PRD §4.2 exactly (period, pool, floor, rollforward, spentToday).
- [ ] Golden unit tests: normal month · payday-today · negative pool · overspend
      redistribution · pending txns · credit purchases · mid-period goal change ·
      already-paid-bill dedup.
- [ ] `engine_snapshots` persistence + `inputs_hash` no-op skip + trigger plumbing.
- [ ] `GET /api/engine/today` + **Today screen v1**: the number + full "why" breakdown
      from snapshot line items, running on seed data.
- [ ] Midnight rollover cron (user timezone).

**Exit:** open app → correct, explainable number from seeded finances; change a seed
bill → number moves correctly. *This is the demo that proves the product.*

## Phase 2 — Transactions, categories, learning loop

- [ ] Category taxonomy seeding; transactions list UI (Activity screen) with day groups.
- [ ] Tiered categorizer: rules → (provider category) → AI fallback (Anthropic, batched)
      → review queue. Corrections write `category_rules`.
- [ ] Recategorize/exclude/link UI; review queue; `spentToday` now driven by
      `is_discretionary` categories.
- [ ] Recompute-on-edit trigger.

**Exit:** editing/categorizing transactions visibly moves today's number.

## Phase 3 — Plaid connectivity

- [ ] `BankProvider` interface + `ManualProvider` (formalizes seed path) + `PlaidProvider`.
- [ ] Link token/exchange endpoints, token encryption (AES-256-GCM), Link UI in Settings.
- [ ] `/transactions/sync` cursor loop with idempotent upserts (pending→posted, removals).
- [ ] Balance refresh, Liabilities pull (min payments, due dates).
- [ ] Webhook endpoint with signature verification + `plaid_webhook_events` log;
      daily cron sweep; manual refresh button; "data as of" UI.
- [ ] Sandbox end-to-end test: connect fake bank → transactions flow → number updates.

**Exit:** connect a sandbox institution and the whole pipeline runs hands-free.

## Phase 4 — Recurring, budgets, goals (Plan screen)

- [ ] Recurring detection: Plaid `/transactions/recurring/get` + own detector; confirm/
      edit/dismiss UI; income confirmation defines engine period.
- [ ] **Already-paid matching** (`recurring_stream_id` linking) with tests — the dedup
      correctness problem called out in `DATABASE.md`.
- [ ] Budgets CRUD + pace bars; goals CRUD + contributions + projected dates.
- [ ] Onboarding flow (connect → confirm income → confirm bills → floor → reveal).

**Exit:** full PRD-MVP loop: onboard, connect, confirm, live daily number.

## Phase 5 — Simulate + insights (the coaching layer)

- [ ] `POST /api/simulate`: day-by-day engine runs with/without hypothetical; Simulate
      screen with impact statement, 30-day curves, goal deltas, "I bought it" planned-
      transaction logging (reconciled on sync).
- [ ] Rule-based insights service: budget pace, price increase, duplicate charge,
      goal trade-off; max-2-cards dashboard placement; dismiss/expiry.
- [ ] Savings-rate simulator (goal slider).

**Exit:** everything in PRD §3.1 (F1–F10) done. Ship it to yourself; use it daily.

## Phase 6 — v1.x fast follows (reorder by lived experience)

Bill reminder emails · subscription management view · cash-flow calendar · net-worth
tracking (investments) · budget rollover · PWA install/polish · CSV import for
non-Plaid accounts.

---

## Working agreements

- Engine changes require tests in the same commit; a wrong number is a P0.
- Every phase merges green: typecheck, vitest, seed-data smoke run.
- Plaid production application gets submitted during Phase 3 (sandbox meanwhile).
- Docs in `docs/budget/` are living: decisions that change get edited, not appended.

## Open questions for the owner

1. **Emergency floor default** — is $500 the right starting cushion for you?
2. **Credit card philosophy** — engine treats card purchases as spent-now (accrual).
   Any accounts you'd want excluded (e.g., a card you float intentionally)?
3. **AI categorization** — OK to send merchant strings (no balances/amounts required)
   to the Anthropic API, or keep v1 rules+Plaid only?
4. **Savings accounts in the pool** — default is excluded from Safe-to-Spend. Agree?
5. **Name** — "SafeSpend" is a placeholder; happy to brainstorm.
