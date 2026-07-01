import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { computeAndSnapshot } from '../services/engineService';
import { createRuleFromCorrection } from '../services/categorize';

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
