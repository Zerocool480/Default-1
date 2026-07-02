import { Router } from 'express';
import { z } from 'zod';
import { getUserId, requireAuth } from '../auth';
import { aiEnabled, listConversations, listMessages, runCopilotTurn } from '../ai/copilot';

export const copilotRouter = Router();
copilotRouter.use(requireAuth);

copilotRouter.get('/status', (_req, res) => {
  res.json({ enabled: aiEnabled() });
});

/** Simple per-user rate limit: 30 messages per hour. */
const usage = new Map<string, number[]>();
const HOUR = 3_600_000;
function allow(userId: string): boolean {
  const now = Date.now();
  const times = (usage.get(userId) ?? []).filter((t) => now - t < HOUR);
  if (times.length >= 30) return false;
  times.push(now);
  usage.set(userId, times);
  return true;
}

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
});

copilotRouter.post('/message', async (req, res) => {
  const userId = getUserId(req);
  if (!aiEnabled()) {
    res.status(503).json({ error: 'The copilot is not configured yet' });
    return;
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Message required (max 2000 characters)' });
    return;
  }
  if (!allow(userId)) {
    res.status(429).json({ error: "You've hit the hourly copilot limit — back shortly." });
    return;
  }
  const result = await runCopilotTurn(userId, parsed.data.message, parsed.data.conversationId);
  res.json(result);
});

copilotRouter.get('/conversations', async (req, res) => {
  const userId = getUserId(req);
  res.json(await listConversations(userId));
});

copilotRouter.get('/conversations/:id/messages', async (req, res) => {
  const userId = getUserId(req);
  const messages = await listMessages(userId, req.params.id!);
  if (!messages) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json(messages);
});
