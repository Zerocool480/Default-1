# Deploying SafeSpend

Three ways to run it for real, easiest first. In production the API server
also serves the built web app, so there is exactly one service + one Postgres.

## Option A — Render (hosted, ~10 minutes, phone-friendly)

1. Push this repo to GitHub (already done if you're reading this there).
2. [render.com](https://render.com) → **New → Blueprint** → connect the repo.
   Render reads [`render.yaml`](render.yaml) and creates the web service +
   Postgres automatically. `JWT_SECRET` and `PLAID_TOKEN_KEY` are generated
   for you.
3. When it's live, open the URL Render gives you, register your account, and
   (optionally) add these in the service's **Environment** tab:
   - `PLAID_CLIENT_ID` + `PLAID_SECRET` — enables "Connect a bank"
   - `AI_ENABLED=true` + `ANTHROPIC_API_KEY` — enables the Copilot

Cost: Render's starter web service + smallest Postgres (~$14/mo as of 2026),
or their free tiers for kicking the tires (free Postgres expires after 30
days — fine for a trial, not for the family's real data).

## Option B — Docker on any machine (a spare PC, a $5 VPS)

```bash
cd safespend
cp .env.example .env        # set JWT_SECRET (long random string) at minimum
docker compose up -d
# open http://localhost:5001
```

The compose file runs Postgres with a persistent volume and applies the
schema on startup. Add the Plaid/Anthropic vars to `.env` when ready.

## Option C — Bare Node (development or a home server)

```bash
cd safespend
npm install
cp .env.example .env        # DATABASE_URL to your Postgres + JWT_SECRET
npm run db:push
npm run build               # typecheck + build the SPA into dist/
npm start                   # NODE_ENV=production, serves API + app on :5001
```

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `JWT_SECRET` | ✅ | Long random string; sessions are signed with it |
| `PORT` | — | Default 5001 |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | — | From dashboard.plaid.com. Without them the app runs on manual/demo data. |
| `PLAID_ENV` | — | `sandbox` (default) or `production` |
| `PLAID_TOKEN_KEY` | with Plaid | 32-byte hex (64 chars) for encrypting bank tokens: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AI_ENABLED` + `ANTHROPIC_API_KEY` | — | Enables Copilot + AI categorization. Everything else works without them. |

## Production checklist

- [ ] HTTPS in front of the app (Render does this automatically; on a VPS put
      Caddy or nginx in front) — session cookies are `secure` in production.
- [ ] `JWT_SECRET` and `PLAID_TOKEN_KEY` are unique, random, and stored only
      in the host's environment — never in git.
- [ ] Rotate any key that was ever shared in chat/email (Anthropic console →
      API keys; Plaid dashboard → keys).
- [ ] Postgres backups: Render's basic plan includes daily backups; with
      docker-compose, snapshot the `safespend-db` volume
      (`docker exec <db> pg_dump -U safespend safespend > backup.sql`).
- [ ] Timezone: each user's timezone lives in Settings (default
      America/New_York) — the morning briefing and midnight rollover use it,
      so server timezone doesn't matter.
- [ ] Plaid production: switch `PLAID_ENV=production` + the production secret
      only after Plaid approves your application. The free Trial plan covers
      10 real bank connections.
