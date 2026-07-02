import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { listGoalsWithEtas } from '../services/goalService';
import { computeAndSnapshot } from '../services/engineService';

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount like 1234.56');

goalsRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  res.json(await listGoalsWithEtas(userId));
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  targetAmount: moneyString,
  monthlyContribution: moneyString.optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fundedAmount: moneyString.optional(),
});

goalsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid goal' });
    return;
  }
  const d = parsed.data;
  await db.insert(schema.goals).values({
    userId,
    name: d.name,
    targetAmount: d.targetAmount,
    monthlyContribution: d.monthlyContribution ?? '0.00',
    fundedAmount: d.fundedAmount ?? '0.00',
    targetDate: d.targetDate ?? null,
  });
  await computeAndSnapshot(userId, 'settings');
  res.status(201).json(await listGoalsWithEtas(userId, { recordHistory: true, trigger: 'settings' }));
});

const patchSchema = createSchema.partial().extend({
  status: z.enum(['active', 'paused', 'completed']).optional(),
});

goalsRouter.patch('/:id', async (req, res) => {
  const userId = getUserId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid update' });
    return;
  }
  const [goal] = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, req.params.id!), eq(schema.goals.userId, userId)));
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  const d = parsed.data;
  await db
    .update(schema.goals)
    .set({
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.targetAmount !== undefined ? { targetAmount: d.targetAmount } : {}),
      ...(d.monthlyContribution !== undefined ? { monthlyContribution: d.monthlyContribution } : {}),
      ...(d.fundedAmount !== undefined ? { fundedAmount: d.fundedAmount } : {}),
      ...(d.targetDate !== undefined ? { targetDate: d.targetDate } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
    })
    .where(eq(schema.goals.id, goal.id));
  await computeAndSnapshot(userId, 'settings');
  res.json(await listGoalsWithEtas(userId, { recordHistory: true, trigger: 'settings' }));
});

goalsRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const deleted = await db
    .delete(schema.goals)
    .where(and(eq(schema.goals.id, req.params.id!), eq(schema.goals.userId, userId)))
    .returning({ id: schema.goals.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: 'Goal not found' });
    return;
  }
  await computeAndSnapshot(userId, 'settings');
  res.json({ ok: true });
});
