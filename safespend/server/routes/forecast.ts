import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { todayInTimezone } from '../../shared/dates';
import { forecastForUser } from '../services/forecastService';
import { buildEngineInputs } from '../services/engineService';
import { computeSafeToSpend } from '../../intelligence/engine/compute';

export const forecastRouter = Router();
forecastRouter.use(requireAuth);

const HORIZONS = new Set([7, 30, 90, 365]);

forecastRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const horizon = Number(req.query.horizon ?? 30);
  if (!HORIZONS.has(horizon)) {
    res.status(400).json({ error: 'horizon must be one of 7, 30, 90, 365' });
    return;
  }
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  // Project at the current allowance spend rate so the forecast and the
  // engine tell one story (ADR-7).
  const { inputs } = await buildEngineInputs(userId, todayISO);
  const allowance = computeSafeToSpend(inputs).dailyAllowanceCents;
  const forecast = await forecastForUser(userId, {
    todayISO,
    startingBalanceCents: inputs.availableCashCents,
    horizonDays: horizon,
    dailyDiscretionaryCents: allowance,
  });
  res.json({ todayISO, dailyDiscretionaryCents: allowance, ...forecast });
});
