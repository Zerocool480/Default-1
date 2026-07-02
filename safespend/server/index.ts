import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { authRouter } from './routes/auth';
import { plaidRouter, plaidWebhookRouter } from './routes/plaid';
import { syncItem } from './services/syncService';
import { engineRouter } from './routes/engine';
import { forecastRouter } from './routes/forecast';
import { transactionsRouter } from './routes/transactions';
import { goalsRouter } from './routes/goals';
import { simulateRouter } from './routes/simulate';
import { miscRouter } from './routes/misc';
import { computeAndSnapshot } from './services/engineService';
import { todayInTimezone } from '../shared/dates';

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/plaid', plaidRouter);
app.use('/api/webhooks/plaid', plaidWebhookRouter);
app.use('/api/engine', engineRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/simulate', simulateRouter);
app.use('/api', miscRouter);

// Central error handler: never leak internals, never fail silently.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  },
);

/**
 * Midnight rollover (PRD §4.4): hourly, recompute for every user whose local
 * day has no snapshot yet. Hourly + idempotent means a missed hour self-heals.
 */
cron.schedule('5 * * * *', async () => {
  try {
    const rows = await db
      .select({ userId: schema.userSettings.userId, timezone: schema.userSettings.timezone })
      .from(schema.userSettings);
    for (const { userId, timezone } of rows) {
      const todayISO = todayInTimezone(timezone);
      const [latest] = await db
        .select({ forDate: schema.engineSnapshots.forDate })
        .from(schema.engineSnapshots)
        .where(eq(schema.engineSnapshots.userId, userId))
        .orderBy(desc(schema.engineSnapshots.computedAt))
        .limit(1);
      if (!latest || latest.forDate !== todayISO) {
        await computeAndSnapshot(userId, 'rollover');
      }
    }
  } catch (err) {
    console.error('[rollover]', err);
  }
});

/** Daily sync sweep at 06:10 server time — webhooks cover freshness between. */
cron.schedule('10 6 * * *', async () => {
  try {
    const items = await db
      .select({ id: schema.plaidItems.id })
      .from(schema.plaidItems)
      .where(eq(schema.plaidItems.provider, 'plaid'));
    for (const { id } of items) {
      await syncItem(id).catch((err) => console.error(`[sync sweep] item ${id}`, err));
    }
  } catch (err) {
    console.error('[sync sweep]', err);
  }
});

const port = Number(process.env.PORT ?? 5001);
app.listen(port, () => {
  console.log(`SafeSpend API listening on :${port}`);
});
