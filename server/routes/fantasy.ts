import { Router } from 'express'
import { db } from '../../db/index.js'
import {
  nflPlayers, weeklyLineups, lineupSlots, playerWeeklyScores,
  usedPlayers, weekStatus, users,
} from '../../db/schema.js'
import { eq, and, inArray, ilike, or, sql, desc } from 'drizzle-orm'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()

const SEASON = 2026

// Week 1 of the 2026 season kicks off Sep 9 at 8:15pm ET
// Each week's lineup lock is 7 days apart from that anchor
function getWeekLockTime(week: number): Date {
  const anchor = new Date('2026-09-09T20:15:00-04:00')
  anchor.setDate(anchor.getDate() + (week - 1) * 7)
  return anchor
}
const SEGMENT_WEEKS: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5, 6],
  2: [7, 8, 9, 10, 11, 12],
  3: [13, 14, 15, 16, 17, 18],
}

function getSegmentForWeek(week: number): number {
  if (week <= 6) return 1
  if (week <= 12) return 2
  return 3
}

const VALID_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX'] as const
type SlotType = typeof VALID_SLOTS[number]

const SLOT_POSITIONS: Record<SlotType, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
}

// GET /fantasy/players?position=QB&search=mahomes
router.get('/players', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { position, search } = req.query as { position?: string; search?: string }

    const conditions: any[] = [eq(nflPlayers.isActive, true)]
    if (position && VALID_SLOTS.includes(position as any)) {
      if (position === 'FLEX') {
        conditions.push(inArray(nflPlayers.position, ['RB', 'WR', 'TE']))
      } else {
        conditions.push(eq(nflPlayers.position, position))
      }
    }
    if (search && search.length > 0) {
      conditions.push(ilike(nflPlayers.name, `%${search}%`))
    }

    const players = await db.select().from(nflPlayers)
      .where(and(...conditions))
      .orderBy(nflPlayers.name)
      .limit(100)

    res.json(players)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch players' })
  }
})

// GET /fantasy/lineup/:week
router.get('/lineup/:week', requireAuth, async (req: AuthRequest, res) => {
  try {
    const week = parseInt(req.params.week)
    const userId = req.userId!

    const [lineup] = await db.select().from(weeklyLineups)
      .where(and(eq(weeklyLineups.userId, userId), eq(weeklyLineups.week, week), eq(weeklyLineups.season, SEASON)))
      .limit(1)

    if (!lineup) {
      res.json({ lineup: null, slots: [], isLocked: false })
      return
    }

    const slots = await db.select({
      id: lineupSlots.id,
      slotType: lineupSlots.slotType,
      fantasyPoints: lineupSlots.fantasyPoints,
      playerId: nflPlayers.id,
      playerName: nflPlayers.name,
      position: nflPlayers.position,
      team: nflPlayers.team,
    })
      .from(lineupSlots)
      .innerJoin(nflPlayers, eq(lineupSlots.playerId, nflPlayers.id))
      .where(eq(lineupSlots.lineupId, lineup.id))

    const [ws] = await db.select().from(weekStatus)
      .where(and(eq(weekStatus.week, week), eq(weekStatus.season, SEASON))).limit(1)

    res.json({ lineup, slots, isLocked: lineup.isLocked || ws?.isLocked || false })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch lineup' })
  }
})

// PUT /fantasy/lineup/:week  { slots: [{playerId, slotType}] }
router.put('/lineup/:week', requireAuth, async (req: AuthRequest, res) => {
  try {
    const week = parseInt(req.params.week)
    const userId = req.userId!
    const { slots } = req.body as { slots: { playerId: number; slotType: SlotType }[] }

    if (!Array.isArray(slots) || slots.length !== 7) {
      res.status(400).json({ error: 'Lineup must have exactly 7 slots' })
      return
    }

    // Check week is not locked (manual lock or time-based lock)
    const [ws] = await db.select().from(weekStatus)
      .where(and(eq(weekStatus.week, week), eq(weekStatus.season, SEASON))).limit(1)
    if (ws?.isLocked) {
      res.status(400).json({ error: 'This week is locked' })
      return
    }
    if (new Date() >= getWeekLockTime(week)) {
      res.status(400).json({ error: `Week ${week} lineups are locked — games have started` })
      return
    }

    // Check existing lineup isn't locked
    const [existingLineup] = await db.select().from(weeklyLineups)
      .where(and(eq(weeklyLineups.userId, userId), eq(weeklyLineups.week, week), eq(weeklyLineups.season, SEASON)))
      .limit(1)
    if (existingLineup?.isLocked) {
      res.status(400).json({ error: 'Your lineup for this week is locked' })
      return
    }

    // Validate slot types
    const slotTypeCounts: Record<string, number> = {}
    for (const s of slots) {
      if (!VALID_SLOTS.includes(s.slotType)) {
        res.status(400).json({ error: `Invalid slot type: ${s.slotType}` })
        return
      }
      slotTypeCounts[s.slotType] = (slotTypeCounts[s.slotType] || 0) + 1
    }
    const required: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 }
    for (const [st, cnt] of Object.entries(required)) {
      if ((slotTypeCounts[st] || 0) !== cnt) {
        res.status(400).json({ error: `Need exactly ${cnt} ${st} slot(s)` })
        return
      }
    }

    // Validate no duplicate players
    const playerIds = slots.map(s => s.playerId)
    if (new Set(playerIds).size !== playerIds.length) {
      res.status(400).json({ error: 'Cannot use the same player in multiple slots' })
      return
    }

    // Fetch player records
    const players = await db.select().from(nflPlayers).where(inArray(nflPlayers.id, playerIds))
    const playerMap = new Map(players.map(p => [p.id, p]))

    // Validate positions match slot types
    for (const s of slots) {
      const player = playerMap.get(s.playerId)
      if (!player) {
        res.status(400).json({ error: `Player ${s.playerId} not found` })
        return
      }
      const allowed = SLOT_POSITIONS[s.slotType]
      if (!allowed.includes(player.position)) {
        res.status(400).json({ error: `${player.name} (${player.position}) cannot play ${s.slotType}` })
        return
      }
    }

    // Check used players for this segment
    const segment = getSegmentForWeek(week)
    const used = await db.select({ playerId: usedPlayers.playerId })
      .from(usedPlayers)
      .where(and(
        eq(usedPlayers.userId, userId),
        eq(usedPlayers.segmentNumber, segment),
        eq(usedPlayers.season, SEASON),
      ))
    const usedIds = new Set(used.map(u => u.playerId))

    // Allow players already in THIS week's lineup (they can replace them)
    let currentLineupPlayerIds: number[] = []
    if (existingLineup) {
      const currentSlots = await db.select({ playerId: lineupSlots.playerId })
        .from(lineupSlots).where(eq(lineupSlots.lineupId, existingLineup.id))
      currentLineupPlayerIds = currentSlots.map(s => s.playerId)
    }

    for (const s of slots) {
      if (usedIds.has(s.playerId) && !currentLineupPlayerIds.includes(s.playerId)) {
        const player = playerMap.get(s.playerId)!
        res.status(400).json({ error: `${player.name} has already been used in Segment ${segment}` })
        return
      }
    }

    // Save lineup
    if (existingLineup) {
      await db.delete(lineupSlots).where(eq(lineupSlots.lineupId, existingLineup.id))
      await db.update(weeklyLineups).set({ submittedAt: new Date() }).where(eq(weeklyLineups.id, existingLineup.id))
      const slotRows = slots.map(s => ({ lineupId: existingLineup.id, playerId: s.playerId, slotType: s.slotType }))
      await db.insert(lineupSlots).values(slotRows)
      res.json({ success: true, lineupId: existingLineup.id })
    } else {
      const [lineup] = await db.insert(weeklyLineups).values({ userId, week, season: SEASON }).returning()
      const slotRows = slots.map(s => ({ lineupId: lineup.id, playerId: s.playerId, slotType: s.slotType }))
      await db.insert(lineupSlots).values(slotRows)
      res.json({ success: true, lineupId: lineup.id })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save lineup' })
  }
})

// GET /fantasy/my-used  → [{playerId, segmentNumber, week, name, position, team}]
router.get('/my-used', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const used = await db.select({
      playerId: usedPlayers.playerId,
      segmentNumber: usedPlayers.segmentNumber,
      week: usedPlayers.week,
      name: nflPlayers.name,
      position: nflPlayers.position,
      team: nflPlayers.team,
    })
      .from(usedPlayers)
      .innerJoin(nflPlayers, eq(usedPlayers.playerId, nflPlayers.id))
      .where(and(eq(usedPlayers.userId, userId), eq(usedPlayers.season, SEASON)))

    res.json(used)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch used players' })
  }
})

// GET /fantasy/standings
router.get('/standings', requireAuth, async (_req, res) => {
  try {
    const allStandings = await db.execute(sql`
      SELECT
        u.id as user_id,
        u.username,
        wl.week,
        COALESCE(SUM(ls.fantasy_points::numeric), 0) as week_points
      FROM users u
      LEFT JOIN weekly_lineups wl ON wl.user_id = u.id AND wl.season = ${SEASON}
      LEFT JOIN lineup_slots ls ON ls.lineup_id = wl.id
      GROUP BY u.id, u.username, wl.week
      ORDER BY u.username
    `)

    // Aggregate by user and segment
    const userMap: Map<number, {
      userId: number; username: string;
      overall: number; seg1: number; seg2: number; seg3: number
    }> = new Map()

    for (const row of allStandings.rows as any[]) {
      if (!userMap.has(row.user_id)) {
        userMap.set(row.user_id, { userId: row.user_id, username: row.username, overall: 0, seg1: 0, seg2: 0, seg3: 0 })
      }
      const u = userMap.get(row.user_id)!
      const pts = parseFloat(row.week_points) || 0
      if (!row.week) continue
      u.overall += pts
      const seg = getSegmentForWeek(row.week)
      if (seg === 1) u.seg1 += pts
      else if (seg === 2) u.seg2 += pts
      else u.seg3 += pts
    }

    const result = Array.from(userMap.values()).map(u => ({
      ...u,
      overall: Math.round(u.overall * 100) / 100,
      seg1: Math.round(u.seg1 * 100) / 100,
      seg2: Math.round(u.seg2 * 100) / 100,
      seg3: Math.round(u.seg3 * 100) / 100,
    }))

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch standings' })
  }
})

// GET /fantasy/available?week=7
// Returns top available players by position for quick-fill
// "Available" = not used in current segment by this user, sorted by last-week score desc
router.get('/available', requireAuth, async (req: AuthRequest, res) => {
  try {
    const week = parseInt(req.query.week as string) || 1
    const userId = req.userId!
    const segment = getSegmentForWeek(week)
    const prevWeek = week - 1

    // Players used by this user this segment
    const used = await db.select({ playerId: usedPlayers.playerId })
      .from(usedPlayers)
      .where(and(eq(usedPlayers.userId, userId), eq(usedPlayers.segmentNumber, segment), eq(usedPlayers.season, SEASON)))
    const usedIds = used.map(u => u.playerId)

    const result: Record<string, any[]> = { QB: [], RB: [], WR: [], TE: [] }

    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      const candidates = await db.execute(sql`
        SELECT
          p.id, p.name, p.position, p.team,
          COALESCE(s.fantasy_points::numeric, 0) as last_score
        FROM nfl_players p
        LEFT JOIN player_weekly_scores s
          ON s.player_id = p.id AND s.week = ${prevWeek} AND s.season = ${SEASON}
        WHERE p.position = ${pos}
          AND p.is_active = true
          ${usedIds.length > 0 ? sql`AND p.id NOT IN (${sql.join(usedIds.map(id => sql`${id}`), sql`, `)})` : sql``}
        ORDER BY last_score DESC, p.name ASC
        LIMIT 10
      `)
      result[pos] = candidates.rows
    }

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch available players' })
  }
})

export default router
