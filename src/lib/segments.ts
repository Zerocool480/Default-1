export const SEGMENTS = [
  { number: 1, label: 'Segment 1', weeks: [1, 2, 3, 4, 5, 6], startDate: 'Sep 9', endDate: 'Oct 12' },
  { number: 2, label: 'Segment 2', weeks: [7, 8, 9, 10, 11, 12], startDate: 'Oct 13', endDate: 'Nov 16' },
  { number: 3, label: 'Segment 3', weeks: [13, 14, 15, 16, 17, 18], startDate: 'Nov 17', endDate: 'Jan 10' },
]

export function getSegmentForWeek(week: number): number {
  if (week <= 6) return 1
  if (week <= 12) return 2
  return 3
}

export function getWeeksForSegment(segment: number): number[] {
  return SEGMENTS[segment - 1]?.weeks ?? []
}
