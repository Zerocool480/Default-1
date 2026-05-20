import { Router } from 'express'
import { db } from '../../db/index.js'
import { leagueSettings } from '../../db/schema.js'

const router = Router()

const SLEEPER_BASE = 'https://api.sleeper.app/v1'

async function sleeperFetch(path: string) {
  const res = await fetch(`${SLEEPER_BASE}${path}`)
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`)
  return res.json()
}

router.get('/league', async (_req, res) => {
  try {
    const [settings] = await db.select().from(leagueSettings).limit(1)
    const leagueId = settings?.sleeperLeagueId || process.env.SLEEPER_LEAGUE_ID
    if (!leagueId) {
      res.json({ configured: false, message: 'No Sleeper league configured yet' })
      return
    }
    const data = await sleeperFetch(`/league/${leagueId}`)
    res.json({ configured: true, league: data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch league data' })
  }
})

router.get('/rosters', async (_req, res) => {
  try {
    const [settings] = await db.select().from(leagueSettings).limit(1)
    const leagueId = settings?.sleeperLeagueId || process.env.SLEEPER_LEAGUE_ID
    if (!leagueId) {
      res.json([])
      return
    }
    const [rosters, users] = await Promise.all([
      sleeperFetch(`/league/${leagueId}/rosters`),
      sleeperFetch(`/league/${leagueId}/users`),
    ])
    res.json({ rosters, users })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch rosters' })
  }
})

router.get('/matchups/:week', async (req, res) => {
  try {
    const [settings] = await db.select().from(leagueSettings).limit(1)
    const leagueId = settings?.sleeperLeagueId || process.env.SLEEPER_LEAGUE_ID
    if (!leagueId) {
      res.json([])
      return
    }
    const data = await sleeperFetch(`/league/${leagueId}/matchups/${req.params.week}`)
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch matchups' })
  }
})

router.get('/standings', async (_req, res) => {
  try {
    const [settings] = await db.select().from(leagueSettings).limit(1)
    const leagueId = settings?.sleeperLeagueId || process.env.SLEEPER_LEAGUE_ID
    if (!leagueId) {
      res.json({ configured: false, standings: [] })
      return
    }
    const [rosters, leagueUsers] = await Promise.all([
      sleeperFetch(`/league/${leagueId}/rosters`),
      sleeperFetch(`/league/${leagueId}/users`),
    ])

    const userMap = new Map((leagueUsers as any[]).map((u: any) => [u.user_id, u]))

    const standings = (rosters as any[])
      .map((r: any) => ({
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        displayName: userMap.get(r.owner_id)?.display_name || 'Unknown',
        avatar: userMap.get(r.owner_id)?.avatar,
        wins: r.settings?.wins || 0,
        losses: r.settings?.losses || 0,
        ties: r.settings?.ties || 0,
        pointsFor: ((r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100),
        pointsAgainst: ((r.settings?.fpts_against || 0) + (r.settings?.fpts_against_decimal || 0) / 100),
      }))
      .sort((a: any, b: any) => b.wins - a.wins || b.pointsFor - a.pointsFor)

    res.json({ configured: true, standings })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch standings' })
  }
})

export default router
