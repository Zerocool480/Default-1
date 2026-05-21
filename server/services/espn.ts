import { db } from '../../db/index.js'
import { nflPlayers, playerWeeklyScores, lineupSlots, weeklyLineups } from '../../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'

const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const POSITIONS = ['QB', 'RB', 'WR', 'TE']

function calcPoints(stats: {
  passingYards: number; passingTDs: number; interceptions: number;
  rushingYards: number; rushingTDs: number; receptions: number;
  receivingYards: number; receivingTDs: number; fumblesLost: number;
}): number {
  let pts = 0
  pts += stats.passingYards * 0.04
  pts += stats.passingTDs * 4
  pts -= stats.interceptions * 2
  pts += stats.rushingYards * 0.1
  pts += stats.rushingTDs * 6
  pts += stats.receptions * 0.5
  pts += stats.receivingYards * 0.1
  pts += stats.receivingTDs * 6
  pts -= stats.fumblesLost * 2
  return Math.round(pts * 100) / 100
}

function parseStatByLabel(labels: string[], stats: string[], label: string): number {
  const idx = labels.findIndex(l => l === label)
  if (idx === -1) return 0
  const v = stats[idx]
  if (!v || v === '--') return 0
  if (v.includes('/')) return parseFloat(v.split('/')[1]) || 0 // C/ATT → attempts; won't be needed
  return parseFloat(v) || 0
}

export async function syncPlayers(): Promise<number> {
  let synced = 0
  for (const pos of POSITIONS) {
    try {
      const url = `${ESPN_SITE}/athletes?limit=500&active=true&position=${pos}`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json() as any

      const athletes = data.athletes || data.items || []
      for (const a of athletes) {
        const espnId = String(a.id || a.uid?.replace('s:20~l:28~a:', '') || '')
        if (!espnId) continue
        const name = a.displayName || a.fullName || a.shortName || ''
        const team = a.team?.abbreviation || a.teamAbbreviation || 'FA'
        if (!name) continue
        await db.insert(nflPlayers).values({ espnId, name, position: pos, team, isActive: true, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: nflPlayers.espnId,
            set: { name, team, isActive: true, updatedAt: new Date() },
          })
        synced++
      }
    } catch (err) {
      console.error(`ESPN sync error for position ${pos}:`, err)
    }
  }
  return synced
}

export async function syncWeekScores(week: number, season: number): Promise<number> {
  // 1. Get scoreboard for this week
  const boardUrl = `${ESPN_SITE}/scoreboard?dates=${season}&seasontype=2&week=${week}`
  const boardRes = await fetch(boardUrl)
  if (!boardRes.ok) throw new Error(`ESPN scoreboard error: ${boardRes.status}`)
  const board = await boardRes.json() as any

  const events = board.events || []
  const athleteStats: Map<string, {
    passingYards: number; passingTDs: number; interceptions: number;
    rushingYards: number; rushingTDs: number; receptions: number;
    receivingYards: number; receivingTDs: number; fumblesLost: number;
    isFinal: boolean;
  }> = new Map()

  // 2. Fetch each game's box score
  for (const event of events) {
    const eventId = event.id
    const isComplete = event.status?.type?.completed || false

    try {
      const sumUrl = `${ESPN_SITE}/summary?event=${eventId}`
      const sumRes = await fetch(sumUrl)
      if (!sumRes.ok) continue
      const summary = await sumRes.json() as any

      const teams = summary.boxscore?.players || []
      for (const teamData of teams) {
        const statGroups = teamData.statistics || []
        for (const group of statGroups) {
          const labels: string[] = group.labels || []
          const athletes: any[] = group.athletes || []

          for (const ath of athletes) {
            const espnId = String(ath.athlete?.id || '')
            if (!espnId) continue
            const stats: string[] = ath.stats || []

            if (!athleteStats.has(espnId)) {
              athleteStats.set(espnId, {
                passingYards: 0, passingTDs: 0, interceptions: 0,
                rushingYards: 0, rushingTDs: 0, receptions: 0,
                receivingYards: 0, receivingTDs: 0, fumblesLost: 0,
                isFinal: isComplete,
              })
            }
            const s = athleteStats.get(espnId)!
            s.isFinal = isComplete

            const gn = group.name?.toLowerCase() || ''
            if (gn === 'passing') {
              s.passingYards += parseStatByLabel(labels, stats, 'YDS')
              s.passingTDs += parseStatByLabel(labels, stats, 'TD')
              s.interceptions += parseStatByLabel(labels, stats, 'INT')
            } else if (gn === 'rushing') {
              s.rushingYards += parseStatByLabel(labels, stats, 'YDS')
              s.rushingTDs += parseStatByLabel(labels, stats, 'TD')
            } else if (gn === 'receiving') {
              s.receptions += parseStatByLabel(labels, stats, 'REC')
              s.receivingYards += parseStatByLabel(labels, stats, 'YDS')
              s.receivingTDs += parseStatByLabel(labels, stats, 'TD')
            } else if (gn === 'fumbles') {
              s.fumblesLost += parseStatByLabel(labels, stats, 'LOST')
            }
          }
        }
      }
    } catch (err) {
      console.error(`ESPN summary error for event ${eventId}:`, err)
    }
  }

  // 3. Match ESPN IDs to our player IDs and upsert scores
  let updated = 0
  for (const [espnId, raw] of athleteStats) {
    const [player] = await db.select({ id: nflPlayers.id })
      .from(nflPlayers).where(eq(nflPlayers.espnId, espnId)).limit(1)
    if (!player) continue

    const fantasyPoints = String(calcPoints(raw))

    await db.insert(playerWeeklyScores).values({
      playerId: player.id, week, season,
      fantasyPoints,
      passingYards: raw.passingYards, passingTDs: raw.passingTDs, interceptions: raw.interceptions,
      rushingYards: raw.rushingYards, rushingTDs: raw.rushingTDs,
      receptions: raw.receptions, receivingYards: raw.receivingYards, receivingTDs: raw.receivingTDs,
      fumblesLost: raw.fumblesLost,
      isFinal: raw.isFinal,
    }).onConflictDoUpdate({
      target: [playerWeeklyScores.playerId, playerWeeklyScores.week, playerWeeklyScores.season],
      set: {
        fantasyPoints,
        passingYards: raw.passingYards, passingTDs: raw.passingTDs, interceptions: raw.interceptions,
        rushingYards: raw.rushingYards, rushingTDs: raw.rushingTDs,
        receptions: raw.receptions, receivingYards: raw.receivingYards, receivingTDs: raw.receivingTDs,
        fumblesLost: raw.fumblesLost,
        isFinal: raw.isFinal,
      },
    })

    // Update lineup slot scores for this week
    await db.execute(sql`
      UPDATE lineup_slots ls
      SET fantasy_points = ${fantasyPoints}
      FROM weekly_lineups wl
      WHERE ls.lineup_id = wl.id
        AND ls.player_id = ${player.id}
        AND wl.week = ${week}
        AND wl.season = ${season}
    `)

    updated++
  }

  return updated
}
