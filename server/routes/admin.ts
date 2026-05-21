import { Router, Request, Response } from 'express'
import { db } from '../../db/index.js'
import { qrCodes, users, punchCards, prizeConfig, leagueSettings, loyaltyParticipants, weekStatus, weeklyLineups, lineupSlots, usedPlayers, nflPlayers, playerWeeklyScores } from '../../db/schema.js'
import { eq, desc, count, and, sql } from 'drizzle-orm'
import { requireAdmin, requireAuth, type AuthRequest } from '../middleware/auth.js'
import crypto from 'crypto'
import QRCode from 'qrcode'
import jwt from 'jsonwebtoken'

const router = Router()

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// Verify admin passcode — upgrades the current user to admin and issues a new JWT
router.post('/verify-passcode', requireAuth, async (req: AuthRequest, res: Response) => {
  const { passcode } = req.body
  if (passcode !== process.env.ADMIN_PASSCODE) {
    res.status(403).json({ valid: false, error: 'Invalid passcode' })
    return
  }
  try {
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, req.userId!))
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
    const token = jwt.sign(
      { userId: user.id, isAdmin: true },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    res.json({
      valid: true,
      token,
      user: { id: user.id, username: user.username, email: user.email, isAdmin: true, sleeperUsername: user.sleeperUsername, loyaltyEligible: user.loyaltyEligible },
    })
  } catch {
    res.status(500).json({ valid: false, error: 'Failed to grant admin access' })
  }
})

// QR Code management
router.get('/qr', requireAdmin, async (_req, res) => {
  try {
    const codes = await db.select().from(qrCodes).orderBy(desc(qrCodes.createdAt)).limit(20)
    res.json(codes)
  } catch {
    res.status(500).json({ error: 'Failed to fetch QR codes' })
  }
})

router.post('/qr/generate', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { weekNumber, seasonYear } = req.body
    const code = crypto.randomUUID()
    const expiresAt = addDays(new Date(), 8) // ~1 week + buffer

    // Deactivate old codes for this week
    await db.update(qrCodes)
      .set({ isActive: false })
      .where(eq(qrCodes.weekNumber, weekNumber))

    const [qr] = await db.insert(qrCodes).values({
      code,
      weekNumber,
      seasonYear: seasonYear || 2026,
      expiresAt,
      isActive: true,
    }).returning()

    const qrDataUrl = await QRCode.toDataURL(code, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
    res.json({ qr, qrDataUrl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate QR code' })
  }
})

// Prize pool
router.get('/prize-config', requireAdmin, async (_req, res) => {
  try {
    let [config] = await db.select().from(prizeConfig).limit(1)
    if (!config) {
      [config] = await db.insert(prizeConfig).values({ freeLeagueBudget: '0', loyaltyParticipantCount: 0 }).returning()
    }
    res.json(config)
  } catch {
    res.status(500).json({ error: 'Failed to get prize config' })
  }
})

router.put('/prize-config', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { freeLeagueBudget, loyaltyParticipantCount } = req.body
    const [existing] = await db.select().from(prizeConfig).limit(1)
    let config
    if (existing) {
      [config] = await db.update(prizeConfig)
        .set({ freeLeagueBudget, loyaltyParticipantCount, updatedAt: new Date() })
        .where(eq(prizeConfig.id, existing.id))
        .returning()
    } else {
      [config] = await db.insert(prizeConfig).values({ freeLeagueBudget, loyaltyParticipantCount }).returning()
    }
    res.json(config)
  } catch {
    res.status(500).json({ error: 'Failed to update prize config' })
  }
})

// League settings
router.get('/league-settings', requireAdmin, async (_req, res) => {
  try {
    let [settings] = await db.select().from(leagueSettings).limit(1)
    if (!settings) {
      [settings] = await db.insert(leagueSettings).values({ season: 2026 }).returning()
    }
    res.json(settings)
  } catch {
    res.status(500).json({ error: 'Failed to get league settings' })
  }
})

router.put('/league-settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { sleeperLeagueId, season } = req.body
    const [existing] = await db.select().from(leagueSettings).limit(1)
    let settings
    if (existing) {
      [settings] = await db.update(leagueSettings)
        .set({ sleeperLeagueId, season, updatedAt: new Date() })
        .where(eq(leagueSettings.id, existing.id))
        .returning()
    } else {
      [settings] = await db.insert(leagueSettings).values({ sleeperLeagueId, season }).returning()
    }
    res.json(settings)
  } catch {
    res.status(500).json({ error: 'Failed to update league settings' })
  }
})

// Users list with punch card data
router.get('/users', requireAdmin, async (_req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      sleeperUsername: users.sleeperUsername,
      loyaltyEligible: users.loyaltyEligible,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt))

    const cards = await db.select().from(punchCards)
    const cardMap = new Map(cards.map(c => [c.userId, c]))

    const result = allUsers.map(u => ({
      ...u,
      punchCard: cardMap.get(u.id) || { visits: 0 },
    }))

    res.json(result)
  } catch {
    res.status(500).json({ error: 'Failed to get users' })
  }
})

// Admin overview stats
router.get('/overview', requireAdmin, async (_req, res) => {
  try {
    const [memberRow] = await db.select({ count: count() }).from(users)
    const [loyaltyEligRow] = await db.select({ count: count() }).from(users).where(eq(users.loyaltyEligible, true))
    const [loyaltyPaidRow] = await db.select({ count: count() }).from(loyaltyParticipants).where(eq(loyaltyParticipants.hasPaid, true))
    const [activeQr] = await db.select().from(qrCodes).where(eq(qrCodes.isActive, true)).orderBy(desc(qrCodes.createdAt)).limit(1)
    const [config] = await db.select().from(prizeConfig).limit(1)

    res.json({
      memberCount: Number(memberRow.count),
      maxMembers: 525,
      loyaltyEligibleCount: Number(loyaltyEligRow.count),
      loyaltyPaidCount: Number(loyaltyPaidRow.count),
      activeQr: activeQr || null,
      freeLeagueBudget: config?.freeLeagueBudget || '0',
      loyaltyPool: ((config?.loyaltyParticipantCount || 0) * 53 / 2).toFixed(2),
    })
  } catch {
    res.status(500).json({ error: 'Failed to get overview' })
  }
})

// Loyalty participant management
router.get('/loyalty', requireAdmin, async (_req, res) => {
  try {
    const eligible = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      sleeperUsername: users.sleeperUsername,
    }).from(users).where(eq(users.loyaltyEligible, true))

    const participants = await db.select().from(loyaltyParticipants)
    const participantMap = new Map(participants.map(p => [p.userId, p]))

    res.json(eligible.map(u => ({
      ...u,
      inPool: participantMap.has(u.id),
      hasPaid: participantMap.get(u.id)?.hasPaid || false,
      confirmedAt: participantMap.get(u.id)?.confirmedAt || null,
    })))
  } catch {
    res.status(500).json({ error: 'Failed to get loyalty participants' })
  }
})

router.post('/loyalty/:userId/confirm', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.userId)
    const { hasPaid } = req.body
    const existing = await db.select().from(loyaltyParticipants).where(eq(loyaltyParticipants.userId, userId)).limit(1)
    if (existing.length > 0) {
      await db.update(loyaltyParticipants).set({ hasPaid: !!hasPaid }).where(eq(loyaltyParticipants.userId, userId))
    } else {
      await db.insert(loyaltyParticipants).values({ userId, hasPaid: !!hasPaid })
    }
    // Keep prizeConfig loyaltyParticipantCount in sync with paid count
    const [{ count: paidCount }] = await db.select({ count: count() }).from(loyaltyParticipants).where(eq(loyaltyParticipants.hasPaid, true))
    const [existing2] = await db.select().from(prizeConfig).limit(1)
    if (existing2) {
      await db.update(prizeConfig).set({ loyaltyParticipantCount: Number(paidCount), updatedAt: new Date() }).where(eq(prizeConfig.id, existing2.id))
    }
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to update loyalty participant' })
  }
})

// CSV export
router.get('/export/users', requireAdmin, async (_req, res) => {
  try {
    const allUsers = await db.select().from(users).orderBy(users.username)
    const cards = await db.select().from(punchCards)
    const cardMap = new Map(cards.map(c => [c.userId, c]))

    const rows = allUsers.map(u => {
      const card = cardMap.get(u.id)
      return [
        u.username,
        u.email,
        u.sleeperUsername || '',
        card?.visits || 0,
        u.loyaltyEligible ? 'Yes' : 'No',
        u.createdAt.toISOString(),
      ].join(',')
    })

    const csv = ['Username,Email,Sleeper Username,Visits,Loyalty Eligible,Joined', ...rows].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="gafl-users.csv"')
    res.send(csv)
  } catch {
    res.status(500).json({ error: 'Export failed' })
  }
})

// Fantasy management routes

router.post('/fantasy/sync-players', requireAdmin, async (_req, res) => {
  try {
    const { syncPlayers } = await import('../services/espn.js')
    const count = await syncPlayers()
    res.json({ success: true, synced: count })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Sync failed' })
  }
})

router.post('/fantasy/sync-scores/:week', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const week = parseInt(req.params.week)
    const season = 2026
    const { syncWeekScores } = await import('../services/espn.js')
    const updated = await syncWeekScores(week, season)
    res.json({ success: true, updated })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Score sync failed' })
  }
})

router.put('/fantasy/score', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { playerId, week, season = 2026, fantasyPoints } = req.body

    await db.insert(playerWeeklyScores).values({
      playerId, week, season,
      fantasyPoints: String(fantasyPoints),
      isFinal: true,
    }).onConflictDoUpdate({
      target: [playerWeeklyScores.playerId, playerWeeklyScores.week, playerWeeklyScores.season],
      set: { fantasyPoints: String(fantasyPoints), isFinal: true },
    })

    // Update lineup slot scores
    await db.execute(sql`
      UPDATE lineup_slots
      SET fantasy_points = ${String(fantasyPoints)}
      FROM weekly_lineups
      WHERE lineup_slots.lineup_id = weekly_lineups.id
        AND lineup_slots.player_id = ${playerId}
        AND weekly_lineups.week = ${week}
        AND weekly_lineups.season = ${season}
    `)

    res.json({ success: true })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Override failed' })
  }
})

router.post('/fantasy/lock/:week', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const week = parseInt(req.params.week)
    const season = 2026
    const segment = week <= 6 ? 1 : week <= 12 ? 2 : 3

    // Lock or create week status
    const [existing] = await db.select().from(weekStatus)
      .where(and(eq(weekStatus.week, week), eq(weekStatus.season, season))).limit(1)
    if (existing) {
      await db.update(weekStatus).set({ isLocked: true }).where(eq(weekStatus.id, existing.id))
    } else {
      await db.insert(weekStatus).values({ week, season, isLocked: true })
    }

    // Lock all lineups for this week and record used players
    const lineups = await db.select().from(weeklyLineups)
      .where(and(eq(weeklyLineups.week, week), eq(weeklyLineups.season, season)))

    for (const lineup of lineups) {
      await db.update(weeklyLineups).set({ isLocked: true }).where(eq(weeklyLineups.id, lineup.id))

      const slots = await db.select({ playerId: lineupSlots.playerId }).from(lineupSlots).where(eq(lineupSlots.lineupId, lineup.id))
      for (const slot of slots) {
        await db.insert(usedPlayers).values({
          userId: lineup.userId,
          playerId: slot.playerId,
          segmentNumber: segment,
          season,
          week,
        }).onConflictDoNothing()
      }
    }

    res.json({ success: true, lineupCount: lineups.length })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Lock failed' })
  }
})

router.get('/fantasy/weeks', requireAdmin, async (_req, res) => {
  try {
    const statuses = await db.select().from(weekStatus).where(eq(weekStatus.season, 2026)).orderBy(weekStatus.week)
    res.json(statuses)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get week statuses' })
  }
})

export default router
