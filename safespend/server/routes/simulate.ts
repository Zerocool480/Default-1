import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { todayInTimezone, addDays } from '../../shared/dates';
import { buildEngineInputs } from '../services/engineService';
import { buildForecastEvents } from '../services/forecastService';
import { computeSafeToSpend } from '../../intelligence/engine/compute';
import { evaluatePurchase } from '../../intelligence/scenario/purchase';

export const simulateRouter = Router();
simulateRouter.use(requireAuth);

const purchaseSchema = z.object({
  type: z.literal('purchase'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount like 449.00'),
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  label: z.string().max(80).optional(),
});

const HORIZON_DAYS = 60; // matches the engine's clamp horizon

simulateRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid simulation' });
    return;
  }

  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  const { inputs } = await buildEngineInputs(userId, todayISO);
  const startISO = addDays(todayISO, 1);
  const events = await buildForecastEvents(userId, startISO, addDays(startISO, HORIZON_DAYS));

  // Project at the pre-purchase allowance rate on both sides: one story,
  // and the purchase's own effect is what the comparison isolates.
  const allowance = computeSafeToSpend(inputs).dailyAllowanceCents;
  const forecastInputs = {
    startISO,
    horizonDays: HORIZON_DAYS,
    startingBalanceCents: inputs.availableCashCents,
    events,
    dailyDiscretionaryCents: allowance,
  };

  const amountCents = Math.round(Number(parsed.data.amount) * 100);
  const evaluation = evaluatePurchase(inputs, forecastInputs, {
    amountCents,
    dateISO: parsed.data.dateISO,
    label: parsed.data.label,
  });
  res.json(evaluation);
});
