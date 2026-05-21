export interface SleeperStanding {
  rosterId: number
  ownerId: string
  displayName: string
  avatar: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

// Season segment definitions (NFL 2026)
export const SEGMENTS = [
  { number: 1, label: 'Segment 1', weeks: [1, 2, 3, 4, 5, 6], startDate: 'Sep 9', endDate: 'Oct 12' },
  { number: 2, label: 'Segment 2', weeks: [7, 8, 9, 10, 11, 12], startDate: 'Oct 13', endDate: 'Nov 16' },
  { number: 3, label: 'Segment 3', weeks: [13, 14, 15, 16, 17, 18], startDate: 'Nov 17', endDate: 'Jan 10' },
]

export function getPrizeBreakdown(budget: number) {
  const segmentBudget = budget * 0.40
  const overallBudget = budget * 0.60
  const perSegment = segmentBudget / 3

  return {
    segments: SEGMENTS.map(s => ({
      ...s,
      first: +(perSegment * 0.50).toFixed(2),
      second: +(perSegment * 0.30).toFixed(2),
      third: +(perSegment * 0.20).toFixed(2),
    })),
    overall: {
      first: +overallBudget.toFixed(2),
    },
    total: +budget.toFixed(2),
  }
}

export function getLoyaltyPool(participantCount: number) {
  const total = participantCount * 53 / 2
  const segmentPool = total * 0.40
  const overallPool = total * 0.60
  const perSegment = segmentPool / 3

  return {
    total: +total.toFixed(2),
    segments: SEGMENTS.map(s => ({
      ...s,
      first: +(perSegment * 0.50).toFixed(2),
      second: +(perSegment * 0.30).toFixed(2),
      third: +(perSegment * 0.20).toFixed(2),
    })),
    overall: +overallPool.toFixed(2),
  }
}
