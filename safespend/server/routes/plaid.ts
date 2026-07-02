import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getUserId, requireAuth } from '../auth';
import { db, schema } from '../../db';
import { encryptToken } from '../crypto';
import type { Request } from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  getInstitutionName,
  plaidEnabled,
  verifyWebhook,
} from '../providers/plaid';
import { syncAllItemsForUser, syncItem } from '../services/syncService';

export const plaidRouter = Router();

plaidRouter.get('/status', requireAuth, (_req, res) => {
  res.json({ enabled: plaidEnabled(), env: process.env.PLAID_ENV ?? 'sandbox' });
});

plaidRouter.post('/link-token', requireAuth, async (req, res) => {
  if (!plaidEnabled()) {
    res.status(503).json({ error: 'Bank connections are not configured yet' });
    return;
  }
  const userId = getUserId(req);
  res.json({ linkToken: await createLinkToken(userId) });
});

const exchangeSchema = z.object({
  publicToken: z.string().min(1),
  institutionId: z.string().optional(),
  institutionName: z.string().optional(),
});

plaidRouter.post('/exchange', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'publicToken required' });
    return;
  }
  const { accessToken, itemId } = await exchangePublicToken(parsed.data.publicToken);

  const institutionName =
    parsed.data.institutionName ??
    (parsed.data.institutionId ? await getInstitutionName(parsed.data.institutionId) : null);

  const [item] = await db
    .insert(schema.plaidItems)
    .values({
      userId,
      provider: 'plaid',
      plaidItemId: itemId,
      accessTokenEnc: encryptToken(accessToken),
      institutionId: parsed.data.institutionId ?? null,
      institutionName,
    })
    .onConflictDoUpdate({
      target: schema.plaidItems.plaidItemId,
      set: { accessTokenEnc: encryptToken(accessToken), status: 'active' },
    })
    .returning();

  // First sync runs inline so the user lands on a populated dashboard.
  const { touched } = await syncItem(item!.id);
  res.status(201).json({ ok: true, itemId: item!.id, transactionsSynced: touched });
});

/** Manual "refresh now" — lightly rate-limited per user. */
const lastManualSync = new Map<string, number>();
plaidRouter.post('/sync', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const last = lastManualSync.get(userId) ?? 0;
  if (Date.now() - last < 30_000) {
    res.status(429).json({ error: 'Just synced — try again in a moment' });
    return;
  }
  lastManualSync.set(userId, Date.now());
  const { touched } = await syncAllItemsForUser(userId);
  res.json({ ok: true, transactionsSynced: touched });
});

/**
 * Plaid webhooks. No auth cookie — Plaid calls this directly, so the payload
 * is authenticated by verifying the `Plaid-Verification` JWT signature against
 * the raw body (verifyWebhook). Verification is mandatory outside sandbox; in
 * sandbox a present header is still verified, and its absence is allowed so
 * local testing works without an internet-reachable endpoint. The daily cron
 * sweep covers freshness regardless.
 */
export const plaidWebhookRouter = Router();
plaidWebhookRouter.post('/', async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const header = req.header('Plaid-Verification');
  const mustVerify = plaidEnabled() && (process.env.PLAID_ENV ?? 'sandbox') !== 'sandbox';
  if (header || mustVerify) {
    const ok = rawBody ? await verifyWebhook(rawBody, header) : false;
    if (!ok) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  }

  const body = req.body as {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
  };
  const [item] = body.item_id
    ? await db.select().from(schema.plaidItems).where(eq(schema.plaidItems.plaidItemId, body.item_id))
    : [undefined];

  const [event] = await db
    .insert(schema.plaidWebhookEvents)
    .values({
      itemId: item?.id ?? null,
      webhookType: body.webhook_type ?? null,
      webhookCode: body.webhook_code ?? null,
      payload: req.body,
    })
    .returning({ id: schema.plaidWebhookEvents.id });

  res.json({ ok: true }); // ack fast; work happens after

  if (!item) return;
  try {
    if (
      body.webhook_type === 'TRANSACTIONS' ||
      body.webhook_code === 'SYNC_UPDATES_AVAILABLE' ||
      body.webhook_code === 'DEFAULT_UPDATE'
    ) {
      await syncItem(item.id);
    } else if (body.webhook_code === 'ITEM_LOGIN_REQUIRED' || body.webhook_type === 'ITEM') {
      await db
        .update(schema.plaidItems)
        .set({ status: body.webhook_code === 'ITEM_LOGIN_REQUIRED' ? 'login_required' : item.status })
        .where(eq(schema.plaidItems.id, item.id));
    }
    await db
      .update(schema.plaidWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.plaidWebhookEvents.id, event!.id));
  } catch (err) {
    console.error('[plaid webhook]', err);
  }
});
