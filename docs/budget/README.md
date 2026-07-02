# SafeSpend — Design Package

**v0.2 — personal financial operating system.** Not another budgeting app: an
advisor/coach/planner that removes uncertainty by answering, every day —
*"How much can I safely spend today, and what's the smartest move next?"*

Read in this order:

1. **[PRD.md](PRD.md)** — vision, layered requirements (data → intelligence →
   guidance), and full specs for the Daily Spending Engine, Daily Briefing, Goal GPS,
   Cash Flow Forecast, Financial Health Score, scenario engine, and Financial Copilot.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — tech stack, layered system design, seven
   ADRs (incl. "deterministic core, conversational shell"), aggregator comparison
   (Plaid vs. MX vs. Finicity vs. Teller), and the Anthropic API integration plan.
3. **[DATABASE.md](DATABASE.md)** — full PostgreSQL schema including snapshot/telemetry
   tables (engine, score, briefings, goal ETAs, copilot audit, forecast accuracy).
4. **[UX.md](UX.md)** — navigation, key flows, the tap-any-number-for-why pattern, and
   the coach-not-shame voice guide.
5. **[WIREFRAMES.md](WIREFRAMES.md)** — low-fi wireframes for the nine main screens.
6. **[ROADMAP.md](ROADMAP.md)** — thirteen small milestones (M0–M12), external
   keys/dependencies table, and open questions awaiting owner decisions.

Status: **M0–M6 implemented** in [`../safespend/`](../safespend/README.md) — engine,
forecast, goal GPS, Today/Activity/Plan/Settings, the category learning loop, and
Plaid connectivity (Link flow, AES-256-GCM token storage, cursor-based sync with
pending→posted handling, balances/liabilities/recurring bootstrap, webhook endpoint,
daily sweep). Next up: M7 (recurring hardening + budgets + calendar) per the roadmap.
