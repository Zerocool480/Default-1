import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { computeAndSnapshot } from '../services/engineService';
import { createRuleFromCorrection } from '../services/categorize';
import { todayInTimezone } from '../../shared/dates';

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

transactionsRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const rows = await db
    .select({
      txn: schema.transactions,
      category: schema.categories,
      account: schema.accounts,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(eq(schema.transactions.userId, userId))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .limit(limit);

  res.json(
    rows.map(({ txn, category, account }) => ({
      id: txn.id,
      date: txn.date,
      name: txn.name,
      merchantName: txn.merchantName,
      amount: txn.amount,
      isPending: txn.isPending,
      source: txn.source,
      excludeFromEngine: txn.excludeFromEngine,
      categoryId: txn.categoryId,
      categoryName: category?.name ?? null,
      isDiscretionary: category?.isDiscretionary ?? false,
      categorySource: txn.categorySource,
      accountName: account.name,
      accountType: account.type,
    })),
  );
});

/**
 * "I bought it" — log a planned transaction so the number updates now; the
 * real transaction reconciles it when it syncs (matching arrives with M7's
 * recurring-matching work; until then it can be excluded/removed by hand).
 */
const plannedSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  name: z.string().min(1).max(80),
  categoryId: z.string().uuid().optional(),
});

transactionsRouter.post('/planned', async (req, res) => {
  const userId = getUserId(req);
  const parsed = plannedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid planned transaction' });
    return;
  }
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  // Planned purchases count as discretionary spending; default to the first
  // discretionary category when none is chosen so spentToday sees it.
  let categoryId = parsed.data.categoryId ?? null;
  if (!categoryId) {
    const [fallback] = await db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.userId, userId), eq(schema.categories.isDiscretionary, true)))
      .limit(1);
    categoryId = fallback?.id ?? null;
  }

  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.includeInCashPool, true)))
    .limit(1);
  if (!account) {
    res.status(400).json({ error: 'No spendable account to log against' });
    return;
  }

  await db.insert(schema.transactions).values({
    userId,
    accountId: account.id,
    amount: parsed.data.amount,
    date: todayISO,
    name: parsed.data.name,
    merchantName: parsed.data.name,
    categoryId,
    categorySource: categoryId ? 'user' : 'none',
    source: 'planned',
    isPending: true,
  });
  const snapshot = await computeAndSnapshot(userId, 'txn_edit');
  res.status(201).json({ ok: true, snapshot });
});

const patchSchema = z.object({
  categoryId: z.string().uuid().optional(),
  excludeFromEngine: z.boolean().optional(),
  /** When set with categoryId: learn a rule from this correction. */
  makeRule: z.boolean().optional(),
});

transactionsRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid update' });
    return;
  }
  const { categoryId, excludeFromEngine, makeRule } = parsed.data;

  const [txn] = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, req.params.id!), eq(schema.transactions.userId, userId)));
  if (!txn) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  if (categoryId) {
    const [cat] = await db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.userId, userId)));
    if (!cat) {
      res.status(400).json({ error: 'Unknown category' });
      return;
    }
  }

  await db
    .update(schema.transactions)
    .set({
      ...(categoryId ? { categoryId, categorySource: 'user' as const } : {}),
      ...(excludeFromEngine !== undefined ? { excludeFromEngine } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.transactions.id, txn.id));

  let ruleInfo: { ruleId: string; retroactivelyApplied: number } | null = null;
  if (makeRule && categoryId) {
    ruleInfo = await createRuleFromCorrection(userId, {
      merchant: txn.merchantName ?? txn.name,
      categoryId,
      fromTransactionId: txn.id,
    });
  }

  // Category and exclusion changes move today's number.
  const snapshot = await computeAndSnapshot(userId, 'txn_edit');
  res.json({ ok: true, rule: ruleInfo, snapshot });
});
