import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '../../db/index.js'
import { users, punchCards } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, sleeperUsername } = req.body
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Missing required fields' })
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

    // Create punch card for new user
    await db.insert(punchCards).values({ userId: user.id })

    const token = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )

    res.json({ token, user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin } })
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

    res.json({ token, user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin, sleeperUsername: user.sleeperUsername, loyaltyEligible: user.loyaltyEligible })
  } catch {
    res.status(500).json({ error: 'Failed to get user' })
  }
})

export default router
