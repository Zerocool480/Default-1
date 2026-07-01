import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { computeAndSnapshot } from '../services/engineService';

/** Accounts, categories, recurring streams, and settings. */
export const miscRouter = Router();
miscRouter.use(requireAuth);

miscRouter.get('/accounts', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db
    .select({ account: schema.accounts, item: schema.plaidItems })
    .from(schema.accounts)
    .innerJoin(schema.plaidItems, eq(schema.accounts.itemId, schema.plaidItems.id))
    .where(eq(schema.accounts.userId, userId));
  res.json(
    rows.map(({ account, item }) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      mask: account.mask,
      currentBalance: account.currentBalance,
      availableBalance: account.availableBalance,
      creditLimit: account.creditLimit,
      includeInCashPool: account.includeInCashPool,
      institutionName: item.institutionName,
      provider: item.provider,
      lastSyncedAt: item.lastSyncedAt,
    })),
  );
});

miscRouter.patch('/accounts/:id', async (req, res) => {
  const userId = getUserId(req);
  const parsed = z.object({ includeInCashPool: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid update' });
    return;
  }
  const updated = await db
    .update(schema.accounts)
    .set({ includeInCashPool: parsed.data.includeInCashPool })
    .where(and(eq(schema.accounts.id, req.params.id!), eq(schema.accounts.userId, userId)))
    .returning({ id: schema.accounts.id });
  if (updated.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const snapshot = await computeAndSnapshot(userId, 'settings');
  res.json({ ok: true, snapshot });
});

miscRouter.get('/categories', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.userId, userId))
    .orderBy(schema.categories.name);
  res.json(rows);
});

miscRouter.get('/recurring', async (req, res) => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(schema.recurringStreams)
    .where(eq(schema.recurringStreams.userId, userId))
    .orderBy(schema.recurringStreams.nextExpectedDate);
  res.json(rows);
});

miscRouter.patch('/recurring/:id', async (req, res) => {
  const userId = getUserId(req);
  const parsed = z
    .object({
      status: z.enum(['detected', 'confirmed', 'dismissed']).optional(),
      isEssential: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid update' });
    return;
  }
  const updated = await db
    .update(schema.recurringStreams)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(eq(schema.recurringStreams.id, req.params.id!), eq(schema.recurringStreams.userId, userId)),
    )
    .returning({ id: schema.recurringStreams.id });
  if (updated.length === 0) {
    res.status(404).json({ error: 'Stream not found' });
    return;
  }
  // Confirming/dismissing a stream changes obligations and possibly the period.
  const snapshot = await computeAndSnapshot(userId, 'settings');
  res.json({ ok: true, snapshot });
});

miscRouter.get('/settings', async (req, res) => {
  const userId = getUserId(req);
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  res.json(settings);
});

miscRouter.patch('/settings', async (req, res) => {
  const userId = getUserId(req);
  const parsed = z
    .object({
      emergencyFloor: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      timezone: z.string().min(1).max(64).optional(),
      periodStrategy: z.enum(['next_income', 'calendar_month']).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid settings' });
    return;
  }
  if (parsed.data.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone });
    } catch {
      res.status(400).json({ error: 'Unknown timezone' });
      return;
    }
  }
  await db
    .update(schema.userSettings)
    .set(parsed.data)
    .where(eq(schema.userSettings.userId, userId));
  const snapshot = await computeAndSnapshot(userId, 'settings');
  res.json({ ok: true, snapshot });
});
