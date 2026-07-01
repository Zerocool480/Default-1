import { Router } from 'express';
import { getUserId, requireAuth } from '../auth';
import { computeAndSnapshot, getToday } from '../services/engineService';
import { listGoalsWithEtas } from '../services/goalService';

export const engineRouter = Router();
engineRouter.use(requireAuth);

engineRouter.get('/today', async (req, res) => {
  const userId = getUserId(req);
  const snapshot = await getToday(userId);
  res.json(snapshot);
});

engineRouter.post('/recompute', async (req, res) => {
  const userId = getUserId(req);
  const snapshot = await computeAndSnapshot(userId, 'manual');
  // ETAs move with the same inputs; refresh their history trail.
  await listGoalsWithEtas(userId, { recordHistory: true, trigger: 'manual' });
  res.json(snapshot);
});
