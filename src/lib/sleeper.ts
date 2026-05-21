export { SEGMENTS } from './segments'
import { SEGMENTS } from './segments'

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
