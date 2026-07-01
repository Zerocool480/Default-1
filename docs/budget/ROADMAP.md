# Build Roadmap — Small Milestones

**Status:** Draft v0.2 (financial-OS scope)

Sequencing principles:

1. **The intelligence layer is the product** — engine and forecast get built and
   tested against seeded data *before* any Plaid wiring. The number works from week
   one; bank sync later upgrades inputs from manual to automatic.
2. **Every milestone ends usable** — something you can open, click, and trust.
3. **AI last within each feature** — deterministic version first (`AI_ENABLED=false`
   path), AI phrasing/chat layered on top (ADR-6).

Milestones are sized to roughly a working session each.

---

### M0 — Foundation
Schema namespace `db/schema/budget/` (per DATABASE.md) + migrations · auth
(register/login/logout, httpOnly sessions) + `user_settings` · 5-tab app shell,
routing, TanStack Query, dark mode · `shared/` Zod schemas · Vitest wired ·
**seed script**: demo user with realistic accounts/transactions/streams/goals
(doubles as engine fixture + no-Plaid demo mode).
**Exit:** log in, see shell, seed data in a raw list.

### M1 — Daily Spending Engine (pure core)
`intelligence/engine/compute.ts` per PRD §4 · golden tests (payday-today, negative
pool, overspend redistribution, pending, credit-at-swipe, mid-period goal change,
already-paid dedup) · `engine_snapshots` + `inputs_hash` + trigger plumbing ·
`GET /api/engine/today` + `/diff`.
**Exit:** API returns the correct, explainable number from seed data.

### M2 — Today screen v1
Hero number + "why" breakdown from snapshot line items · spent-today bar · midnight
rollover cron (user timezone) · manual "recompute" during dev.
**Exit:** open app → the number, decomposed. *The demo that proves the product.*

### M3 — Transactions & the learning loop
Activity screen (day groups, discretionary subtotals, pending ghosts) · category
taxonomy seeding · tiered categorizer with rules tier + review queue (AI tier stubbed) ·
recategorize/exclude/make-rule sheet · recompute-on-edit.
**Exit:** fixing a category visibly moves today's number.

### M4 — Cash Flow Forecast (pure core)
`intelligence/forecast/project.ts` per PRD §7 · golden tests (known streams → exact
series; minimum-balance day) · `GET /api/forecast` · engine dip-clamp integration ·
Today's "next 7 days" strip.
**Exit:** forecast API matches hand-computed fixtures; number clamps when a dip looms.

### M5 — Goals + GPS
Goals CRUD + contributions · ETA computation off the forecast · `goal_eta_history` ·
Plan→Goals screen with % + ETA + sparkline.
**Exit:** editing a contribution or adding seed spending moves ETAs correctly.

### M6 — Plaid connectivity
`BankProvider` interface · `ManualProvider` formalized (CSV import) · `PlaidProvider`:
link-token/exchange, AES-256-GCM token storage, `/transactions/sync` cursor loop with
idempotent upserts, balances + liabilities pulls · webhook endpoint (JWT-verified) +
`plaid_webhook_events` · daily sweep cron + manual refresh + "data as of" UI ·
sandbox E2E: connect fake bank → number updates hands-free.
**Exit:** full pipeline runs from a real (sandbox) institution. *Submit Plaid
production application now.*

### M7 — Recurring, budgets, calendar
Recurring detection (Plaid recurring + own detector) · confirm/edit/dismiss UI ·
**already-paid matching** with tests (the dedup problem, DATABASE.md) · income
confirmation drives engine period · budgets CRUD + pace bars · Plan→Calendar (month
grid + projected balance line + minimum-balance callout).
**Exit:** onboarding-critical data all confirmable; calendar agrees with the number.

### M8 — Scenario engine + Purchase Intelligence
`intelligence/scenario/run.ts`: four delta types (one-off, recurring change, income
shock, windfall) over forecast+engine+ETAs+score · risk thresholds + tests ·
`POST /api/simulate` · **"Can I afford this?" FAB + modal** (verdict, impact list,
30-day chart, "I bought it" planned-txn logging + sync reconciliation) · goal slider
simulator.
**Exit:** the Nintendo Switch scenario from the PRD works end-to-end.

### M9 — Health Score + Daily Briefing
`intelligence/score/compute.ts`: 8 sub-scores + weights (config) + attribution ·
daily `score_snapshots` · score screen · briefing rule tree (recommendation codes +
reasons) · morning cron assembling briefing from existing artifacts · Today briefing
card · `briefings` persistence + read tracking · opt-in email via nodemailer.
**Exit:** wake up to a correct briefing whose every line is tappable-explainable.

### M10 — Onboarding + insights
Guided flow: connect → sync progress → confirm income → confirm bills → floor →
first goal → annotated number reveal · deterministic coach insights (budget pace,
Friday pattern, trend vs. goal, price increase, duplicate charge) with max-2 placement ·
subscription manager view (Keep/Review/Cancel heuristics).
**Exit:** a fresh user reaches a trustworthy number in ~5 minutes. **← MVP line.**

### M11 — Financial Copilot
Anthropic tool-use loop (`claude-sonnet-5`, streaming SSE) over intelligence read APIs +
`run_scenario` · system prompt (coach voice, grounding rule, advice disclaimer,
refusal boundaries) · conversation persistence with `tool_calls` audit ·
Copilot screen with suggested prompts + tappable citations · eval fixtures asserting
no un-sourced figures · per-user rate limits · `AI_ENABLED` kill-switch.
**Exit:** "Why did my number change today?" answered correctly from snapshot diffs.

### M12 — AI polish
Categorizer AI tier (batched Haiku, merchant-strings-only) · briefing phrasing pass
(Haiku, post-check that numbers are unchanged) · copilot context-aware suggested
prompts · forecast_checks nightly job + accuracy chart in Settings.
**Exit:** v1 complete — everything in PRD §3.1–3.4.

### Later (backlog, reorder by lived experience)
Net worth dashboard · debt payoff optimizer (avalanche/snowball) · retirement
forecasting · budgeting styles (zero-based, envelope, 50/30/20) · savings challenges &
milestones · shared/family budgets · exportable reports · spending alert push infra ·
weekday-adjusted forecast · Teller/SimpleFIN providers.

---

## Working agreements

- Intelligence-layer changes require tests in the same commit; a wrong number is a P0.
- Every milestone merges green: typecheck, vitest, seed-data smoke run.
- Docs in `docs/budget/` are living — decisions that change get edited, not appended.
- Forecast accuracy is tracked from the first real sync; we don't ship confidence we
  can't measure.

## External dependencies & keys (what the owner needs to obtain)

| When | What | Cost | Notes |
|---|---|---|---|
| M6 | **Plaid account** → Sandbox `client_id` + `secret` | Free | Self-serve at dashboard.plaid.com; sandbox covers all dev. |
| M6+ | Plaid **production** approval | ~$5–10/mo (1 user) | Application takes days–weeks; submit during M6, keep building in sandbox. |
| M11 | **Anthropic API key** | Single-digit $/mo (1 user) | console.anthropic.com; used for copilot (Sonnet) + categorization/phrasing (Haiku). Not needed before M11 — M3's AI tier is stubbed behind the interface. |
| M9 (opt.) | SMTP credentials for briefing email | Free tier fine | Any provider; nodemailer already in repo. |

Nothing is needed to start: **M0–M5 run entirely on seed data with zero external
accounts.**

## Open questions for the owner

1. Emergency floor default — is $500 right for you?
2. Credit-card philosophy — engine counts card purchases at swipe time; any card you
   intentionally float that should be excluded?
3. AI data comfort — OK sending merchant strings (categorization) and financial
   summaries (copilot) to the Anthropic API? (`AI_ENABLED=false` path exists regardless.)
4. Savings accounts default-excluded from the spendable pool — agree?
5. Briefing delivery — in-app only, or email/push too (needs SMTP / PWA push setup)?
6. Name — "SafeSpend" remains a placeholder.
