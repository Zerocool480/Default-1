import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareISO,
  diffDays,
  firstOfMonth,
  firstOfNextMonth,
  formatShort,
  todayInTimezone,
} from './dates';

describe('calendar-date arithmetic', () => {
  it('adds and diffs across month/year/leap boundaries', () => {
    expect(addDays('2026-07-01', 14)).toBe('2026-07-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(diffDays('2026-07-01', '2026-07-15')).toBe(14);
    expect(diffDays('2026-07-15', '2026-07-01')).toBe(-14);
  });

  it('is DST-safe (dates around US transitions stay whole days)', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('compares lexically-valid ISO dates', () => {
    expect(compareISO('2026-07-01', '2026-07-02')).toBe(-1);
    expect(compareISO('2026-07-02', '2026-07-02')).toBe(0);
  });

  it('month helpers', () => {
    expect(firstOfMonth('2026-07-19')).toBe('2026-07-01');
    expect(firstOfNextMonth('2026-07-19')).toBe('2026-08-01');
    expect(firstOfNextMonth('2026-12-19')).toBe('2027-01-01');
  });

  it('resolves user-local today from timezone', () => {
    // 2026-07-02 03:00 UTC is still 2026-07-01 in New York.
    const now = new Date('2026-07-02T03:00:00Z');
    expect(todayInTimezone('America/New_York', now)).toBe('2026-07-01');
    expect(todayInTimezone('UTC', now)).toBe('2026-07-02');
  });

  it('rejects malformed dates', () => {
    expect(() => diffDays('2026-7-1', '2026-07-15')).toThrow();
    expect(() => formatShort('July 1')).toThrow();
  });
});
