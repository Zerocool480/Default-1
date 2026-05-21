// NFL 2026 season: Sep 9, 2026 – Jan 10, 2027
const SEASON_START = new Date('2026-09-09T00:00:00')
const SEASON_END = new Date('2027-01-10T23:59:59')
const TOTAL_WEEKS = 18

export function getCurrentNflWeek(): number | null {
  const now = new Date()
  if (now < SEASON_START || now > SEASON_END) return null
  const diffMs = now.getTime() - SEASON_START.getTime()
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1
  return Math.min(week, TOTAL_WEEKS)
}

export function getSegmentForWeek(week: number): 1 | 2 | 3 | null {
  if (week >= 1 && week <= 6) return 1
  if (week >= 7 && week <= 12) return 2
  if (week >= 13 && week <= 18) return 3
  return null
}

export function getSeasonStatus(): 'preseason' | 'active' | 'complete' {
  const now = new Date()
  if (now < SEASON_START) return 'preseason'
  if (now > SEASON_END) return 'complete'
  return 'active'
}
