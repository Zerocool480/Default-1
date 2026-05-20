import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: number
  isAdmin?: boolean
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number; isAdmin: boolean }
    req.userId = payload.userId
    req.isAdmin = payload.isAdmin
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.isAdmin) {
      res.status(403).json({ error: 'Admin only' })
      return
    }
    next()
  })
}
