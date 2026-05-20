import { Router } from 'express'
import { db } from '../../db/index.js'
import { punchCards, punchCardScans, qrCodes, users } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()

router.get('/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [card] = await db.select().from(punchCards).where(eq(punchCards.userId, req.userId!)).limit(1)
    res.json(card || { userId: req.userId, visits: 0 })
  } catch {
    res.status(500).json({ error: 'Failed to get punch card' })
  }
})

router.post('/scan', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { code } = req.body
    if (!code) {
      res.status(400).json({ error: 'No QR code provided' })
      return
    }

    // Find active QR code
    const [qr] = await db.select().from(qrCodes)
      .where(and(eq(qrCodes.code, code), eq(qrCodes.isActive, true)))
      .limit(1)

    if (!qr) {
      res.status(404).json({ error: 'Invalid or expired QR code' })
      return
    }

    if (new Date() > qr.expiresAt) {
      res.status(410).json({ error: 'QR code has expired' })
      return
    }

    // Check already scanned this week's code
    const [alreadyScanned] = await db.select().from(punchCardScans)
      .where(and(eq(punchCardScans.userId, req.userId!), eq(punchCardScans.qrCodeId, qr.id)))
      .limit(1)

    if (alreadyScanned) {
      res.status(409).json({ error: "Already scanned this week's code" })
      return
    }

    // Get or create punch card
    let [card] = await db.select().from(punchCards).where(eq(punchCards.userId, req.userId!)).limit(1)
    if (!card) {
      [card] = await db.insert(punchCards).values({ userId: req.userId! }).returning()
    }

    if (card.visits >= 10) {
      res.status(400).json({ error: 'Punch card already complete!' })
      return
    }

    // Record scan and increment visits
    await db.insert(punchCardScans).values({ userId: req.userId!, qrCodeId: qr.id })

    const newVisits = card.visits + 1
    const [updatedCard] = await db.update(punchCards)
      .set({
        visits: newVisits,
        completedAt: newVisits >= 10 ? new Date() : null,
      })
      .where(eq(punchCards.userId, req.userId!))
      .returning()

    // Mark user loyalty eligible when complete
    if (newVisits >= 10) {
      await db.update(users).set({ loyaltyEligible: true }).where(eq(users.id, req.userId!))
    }

    res.json({
      card: updatedCard,
      message: newVisits >= 10
        ? "Punch card complete! You're in the loyalty pool!"
        : `Visit ${newVisits} of 10 recorded!`,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Scan failed' })
  }
})

export default router
