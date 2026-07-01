import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
const SECRET: string = JWT_SECRET;

const COOKIE_NAME = 'safespend_session';
const SESSION_DAYS = 30;

export interface AuthedRequest extends Request {
  userId: string;
}

/** Read the user id set by requireAuth; throws if the middleware was skipped. */
export function getUserId(req: unknown): string {
  const userId = (req as { userId?: string }).userId;
  if (!userId) throw new Error('getUserId called on an unauthenticated request');
  return userId;
}

export function issueSession(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86_400_000,
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  try {
    const payload = jwt.verify(token, SECRET);
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    (req as AuthedRequest).userId = payload.sub;
    next();
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'Session expired' });
  }
}
