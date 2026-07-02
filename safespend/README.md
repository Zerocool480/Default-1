# SafeSpend

A personal financial operating system built around one daily answer:
**"How much money can I safely spend today without hurting my financial goals?"**

Design docs live in [`../docs/budget/`](../docs/budget/README.md). This app implements
milestones **M0–M6** of the [roadmap](../docs/budget/ROADMAP.md): the Daily Spending
Engine, cash-flow forecast, goal GPS, the Today/Activity/Plan/Settings screens, the
category learning loop, and Plaid bank connectivity (Link → encrypted tokens →
cursor-based sync → balances/liabilities/recurring). Runs fully on seeded demo data
with no Plaid keys; add `PLAID_CLIENT_ID`/`PLAID_SECRET` (sandbox) to `.env` to enable
the “Connect a bank” flow in Settings.

## Quickstart

```bash
cd safespend
npm install
cp .env.example .env            # set DATABASE_URL + JWT_SECRET

# one-time database setup (any Postgres 14+):
#   CREATE USER safespend WITH PASSWORD '...';
#   CREATE DATABASE safespend OWNER safespend;
npm run db:push                 # create tables
npm run db:seed                 # demo user + 2 months of realistic finances

npm run dev                     # API :5001 + web :5173
```

Sign in with the seeded demo user (credentials printed by `db:seed`), or register your
own account and add data through the API.

## Scripts

| script | what |
|---|---|
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm test` | vitest — engine/forecast/ETA golden suites (the money math) |
| `npm run typecheck` | strict TS across server, client, and intelligence layer |
| `npm run db:push` | apply schema (drizzle-kit) |
| `npm run db:seed` | reset + reseed the demo user |

## Layout

```
shared/        money (integer cents), calendar dates, engine/forecast types
intelligence/  pure deterministic core: engine, forecast, goal ETAs (+tests)
db/            drizzle schema (docs/budget/DATABASE.md) + client
server/        express API: auth, routes, services (DB → pure core → snapshots)
src/           React PWA: Today, Activity, Plan, Copilot (placeholder), Settings
scripts/       seed
```

Two rules the whole codebase follows:

1. **Money is integer cents everywhere in TS**, `numeric(14,2)` in Postgres; floats
   never carry money.
2. **The intelligence layer is pure** — no I/O, clock passed in as data. Every computed
   number persists a snapshot with its line items, so "why?" is always answerable.
