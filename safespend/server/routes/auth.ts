import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { clearSession, getUserId, issueSession, requireAuth } from '../auth';
import { ensureDefaultCategories } from '../services/taxonomy';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

authRouter.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and a password of at least 8 characters required' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const [user] = await db.insert(schema.users).values({ email, passwordHash }).returning();
  await db.insert(schema.userSettings).values({ userId: user!.id });
  await ensureDefaultCategories(user!.id);
  issueSession(res, user!.id);
  res.status(201).json({ id: user!.id, email });
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }
  issueSession(res, user.id);
  res.json({ id: user.id, email: user.email });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) {
    clearSession(res);
    res.status(401).json({ error: 'Account not found' });
    return;
  }
  res.json({ id: user.id, email: user.email });
});
