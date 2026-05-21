import { Router } from 'express'
import { db } from '../../db/index.js'
import { prizeConfig, users, loyaltyParticipants } from '../../db/schema.js'
import { count, eq } from 'drizzle-orm'

const router = Router()

const MAX_MEMBERS = 525

// Public stats — no auth required. Used by Dashboard and prize displays for all members.
router.get('/stats', async (_req, res) => {
  try {
    const [config] = await db.select().from(prizeConfig).limit(1)
    const [memberRow] = await db.select({ count: count() }).from(users)
    const [loyaltyEligibleRow] = await db.select({ count: count() }).from(users).where(eq(users.loyaltyEligible, true))
    const [loyaltyPaidRow] = await db.select({ count: count() }).from(loyaltyParticipants).where(eq(loyaltyParticipants.hasPaid, true))

    res.json({
      freeLeagueBudget: config?.freeLeagueBudget || '0',
      loyaltyParticipantCount: config?.loyaltyParticipantCount || 0,
      memberCount: Number(memberRow.count),
      loyaltyEligibleCount: Number(loyaltyEligibleRow.count),
      loyaltyPaidCount: Number(loyaltyPaidRow.count),
      maxMembers: MAX_MEMBERS,
      spotsRemaining: MAX_MEMBERS - Number(memberRow.count),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

export default router
