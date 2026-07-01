# SafeSpend — Design Package

A personal budgeting app built around one daily answer:
**"How much money can I safely spend today without hurting my financial goals?"**

Read in this order:

1. **[PRD.md](PRD.md)** — vision, product principles, feature requirements, and the
   Daily Spending Engine spec (the formula, its rules, and the explainability contract).
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — tech stack (reusing this repo's
   React/Express/Drizzle/Postgres foundation), system design, key ADRs, Plaid
   integration strategy, and the API surface.
3. **[DATABASE.md](DATABASE.md)** — full PostgreSQL schema, how the engine reads it,
   and the already-paid-bill dedup problem.
4. **[UX.md](UX.md)** — the five screens (Today, Activity, Plan, Simulate, Settings),
   key flows, and the coach-not-shame voice guide.
5. **[ROADMAP.md](ROADMAP.md)** — the phased build plan (engine first, Plaid third)
   and open questions awaiting owner decisions.

Status: architecture phase — no application code yet. Phase 0 of the roadmap begins
implementation.
