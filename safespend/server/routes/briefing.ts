import { Router } from 'express';
import { getUserId, requireAuth } from '../auth';
import { getOrCreateTodayBriefing, markBriefingRead, scoreHistory } from '../services/briefingService';
import { getOrComputeTodayScore } from '../services/scoreService';
import { dismissInsight, getActiveInsights } from '../services/insightsService';

export const briefingRouter = Router();
briefingRouter.use(requireAuth);

briefingRouter.get('/today', async (req, res) => {
  const userId = getUserId(req);
  const briefing = await getOrCreateTodayBriefing(userId);
  void markBriefingRead(userId, briefing.forDate); // read-rate is the north-star metric
  res.json(briefing);
});

export const scoreRouter = Router();
scoreRouter.use(requireAuth);

scoreRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  res.json(await getOrComputeTodayScore(userId));
});

scoreRouter.get('/history', async (req, res) => {
  const userId = getUserId(req);
  res.json(await scoreHistory(userId));
});

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

insightsRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  res.json(await getActiveInsights(userId));
});

insightsRouter.post('/:id/dismiss', async (req, res) => {
  const userId = getUserId(req);
  const ok = await dismissInsight(userId, req.params.id!);
  if (!ok) {
    res.status(404).json({ error: 'Insight not found' });
    return;
  }
  res.json({ ok: true });
});
