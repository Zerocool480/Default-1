import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { db } from '../../db/index.js'
import { users, punchCards, passwordResetTokens } from '../../db/schema.js'
import { eq, count } from 'drizzle-orm'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()
const MAX_MEMBERS = 525

function makeUserPayload(user: typeof users.$inferSelect) {
  return { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin, sleeperUsername: user.sleeperUsername, loyaltyEligible: user.loyaltyEligible }
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, sleeperUsername } = req.body
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    // Enforce 525 member cap
    const [{ count: memberCount }] = await db.select({ count: count() }).from(users)
    if (Number(memberCount) >= MAX_MEMBERS) {
      res.status(403).json({ error: 'The league is full (525 members). Contact the commissioner.' })
      return
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing.length > 0) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [user] = await db.insert(users).values({
      username,
      email,
      passwordHash,
      sleeperUsername: sleeperUsername || null,
    }).returning()

    await db.insert(punchCards).values({ userId: user.id })

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )

    res.json({ token, user: makeUserPayload(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )

    res.json({ token, user: makeUserPayload(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    res.json(makeUserPayload(user))
  } catch {
    res.status(500).json({ error: 'Failed to get user' })
  }
})

router.put('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { sleeperUsername, sleeperUserId } = req.body
    const [user] = await db.update(users)
      .set({ sleeperUsername: sleeperUsername || null, sleeperUserId: sleeperUserId || null })
      .where(eq(users.id, req.userId!))
      .returning()
    res.json(makeUserPayload(user))
  } catch {
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// POST /auth/forgot-password — generates a reset token and emails it
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  // Always respond with success to avoid leaking whether an email exists
  res.json({ message: 'If that email is registered, a reset link has been sent.' })

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) return

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt })

    const appUrl = process.env.APP_URL || 'http://localhost:5173'
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    const { sendPasswordReset } = await import('../services/email.js')
    await sendPasswordReset(user.email, resetUrl)
  } catch (err) {
    console.error('Forgot password error:', err)
  }
})

// POST /auth/reset-password — validates token and sets new password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Token and a password of at least 6 characters are required' })
      return
    }

    const [record] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token)).limit(1)

    if (!record) {
      res.status(400).json({ error: 'Invalid or expired reset link' })
      return
    }
    if (record.usedAt) {
      res.status(400).json({ error: 'This reset link has already been used' })
      return
    }
    if (new Date() > record.expiresAt) {
      res.status(400).json({ error: 'This reset link has expired — please request a new one' })
      return
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.update(users).set({ passwordHash }).where(eq(users.id, record.userId))
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.id))

    res.json({ message: 'Password updated — you can now sign in.' })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

export default router
