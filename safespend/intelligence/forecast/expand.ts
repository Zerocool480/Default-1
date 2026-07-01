/**
 * Expand a recurring stream into concrete dated occurrences within a window,
 * anchored on its next_expected_date. Used to turn streams into forecast
 * events and period obligations.
 */
import { addDays, assertISODate, compareISO, firstOfNextMonth } from '../../shared/dates';

export type Frequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly' | 'annual' | 'irregular';

function nextOccurrence(dateISO: string, frequency: Frequency): string | null {
  switch (frequency) {
    case 'weekly':
      return addDays(dateISO, 7);
    case 'biweekly':
      return addDays(dateISO, 14);
    case 'semi_monthly': {
      // 1st and 15th of each month.
      const day = Number(dateISO.slice(8, 10));
      if (day < 15) return `${dateISO.slice(0, 8)}15`;
      return firstOfNextMonth(dateISO);
    }
    case 'monthly': {
      const day = Number(dateISO.slice(8, 10));
      const firstNext = firstOfNextMonth(dateISO);
      // Clamp to the 28th so Feb/short months never skip or overflow.
      const clamped = Math.min(day, 28);
      return `${firstNext.slice(0, 8)}${String(clamped).padStart(2, '0')}`;
    }
    case 'annual': {
      const y = Number(dateISO.slice(0, 4));
      return `${y + 1}${dateISO.slice(4)}`;
    }
    case 'irregular':
      return null; // one known occurrence only
  }
}

/** All occurrence dates within [fromISO, toISO), starting from the anchor. */
export function expandOccurrences(
  anchorISO: string,
  frequency: Frequency,
  fromISO: string,
  toISO: string,
  maxOccurrences = 400,
): string[] {
  assertISODate(anchorISO);
  assertISODate(fromISO);
  assertISODate(toISO);
  const out: string[] = [];
  let d: string | null = anchorISO;
  for (let i = 0; d !== null && i < maxOccurrences; i++) {
    if (compareISO(d, toISO) >= 0) break;
    if (compareISO(d, fromISO) >= 0) out.push(d);
    d = nextOccurrence(d, frequency);
  }
  return out;
}
