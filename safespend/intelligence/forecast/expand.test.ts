import { describe, expect, it } from 'vitest';
import { expandOccurrences } from './expand';

describe('expandOccurrences', () => {
  it('biweekly paychecks across a month', () => {
    expect(expandOccurrences('2026-07-10', 'biweekly', '2026-07-01', '2026-08-15')).toEqual([
      '2026-07-10',
      '2026-07-24',
      '2026-08-07',
    ]);
  });

  it('monthly bills keep their day-of-month, clamped to 28', () => {
    expect(expandOccurrences('2026-01-31', 'monthly', '2026-01-01', '2026-04-01')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
    ]);
    expect(expandOccurrences('2026-07-09', 'monthly', '2026-07-01', '2026-10-01')).toEqual([
      '2026-07-09',
      '2026-08-09',
      '2026-09-09',
    ]);
  });

  it('semi-monthly hits the 1st and 15th', () => {
    expect(expandOccurrences('2026-07-01', 'semi_monthly', '2026-07-01', '2026-09-01')).toEqual([
      '2026-07-01',
      '2026-07-15',
      '2026-08-01',
      '2026-08-15',
    ]);
  });

  it('irregular streams contribute only their one known date', () => {
    expect(expandOccurrences('2026-07-20', 'irregular', '2026-07-01', '2026-12-01')).toEqual([
      '2026-07-20',
    ]);
  });

  it('anchor before the window fast-forwards into it', () => {
    expect(expandOccurrences('2026-06-05', 'weekly', '2026-07-01', '2026-07-15')).toEqual([
      '2026-07-03',
      '2026-07-10',
    ]);
  });

  it('window end is exclusive', () => {
    expect(expandOccurrences('2026-07-15', 'monthly', '2026-07-01', '2026-07-15')).toEqual([]);
  });
});
