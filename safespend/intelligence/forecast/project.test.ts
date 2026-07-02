import { describe, expect, it } from 'vitest';
import { projectCashFlow } from './project';
import type { ForecastEvent } from '../../shared/forecast';

const ev = (
  id: string,
  dateISO: string,
  amountCents: number,
  type: ForecastEvent['type'] = 'bill',
): ForecastEvent => ({ id, dateISO, amountCents, label: id, type });

describe('projectCashFlow — golden scenarios', () => {
  it('projects a hand-computable month exactly', () => {
    const r = projectCashFlow({
      startISO: '2026-07-02',
      horizonDays: 14,
      startingBalanceCents: 2_138_00,
      events: [
        ev('mortgage', '2026-07-09', -420_00),
        ev('internet', '2026-07-07', -98_00),
        ev('electric', '2026-07-11', -84_00),
        ev('paycheck', '2026-07-15', 2_350_00, 'paycheck'),
      ],
      dailyDiscretionaryCents: 30_00,
    });

    expect(r.days).toHaveLength(14);
    // Day 1 (Jul 2): 2138 − 30 = 2108
    expect(r.days[0]).toMatchObject({ dateISO: '2026-07-02', endBalanceCents: 2_108_00 });
    // Jul 7: 2138 − 6×30 − 98 = 1860
    expect(r.days[5]!.endBalanceCents).toBe(1_860_00);
    // Jul 14 (day before payday): 2138 − 13×30 − 98 − 420 − 84 = 1146
    expect(r.days[12]!.endBalanceCents).toBe(1_146_00);
    // Jul 15: +2350 − 30 → 3466
    expect(r.days[13]!.endBalanceCents).toBe(3_466_00);
    // Lowest point is the day before payday.
    expect(r.minDay).toEqual({ dateISO: '2026-07-14', endBalanceCents: 1_146_00 });
    expect(r.endBalanceCents).toBe(3_466_00);
  });

  it('same-day events all land on that day, order-independent', () => {
    const r = projectCashFlow({
      startISO: '2026-07-01',
      horizonDays: 1,
      startingBalanceCents: 100_00,
      events: [ev('a', '2026-07-01', -40_00), ev('b', '2026-07-01', 25_00, 'paycheck')],
      dailyDiscretionaryCents: 0,
    });
    expect(r.days[0]!.events).toHaveLength(2);
    expect(r.endBalanceCents).toBe(85_00);
  });

  it('ignores events outside the horizon', () => {
    const r = projectCashFlow({
      startISO: '2026-07-01',
      horizonDays: 7,
      startingBalanceCents: 500_00,
      events: [ev('early', '2026-06-30', -100_00), ev('late', '2026-07-08', -100_00)],
      dailyDiscretionaryCents: 0,
    });
    expect(r.endBalanceCents).toBe(500_00);
    expect(r.days.every((d) => d.events.length === 0)).toBe(true);
  });

  it('projects negative balances honestly (the warning case)', () => {
    const r = projectCashFlow({
      startISO: '2026-07-01',
      horizonDays: 3,
      startingBalanceCents: 100_00,
      events: [ev('rent', '2026-07-02', -900_00)],
      dailyDiscretionaryCents: 10_00,
    });
    expect(r.minDay.endBalanceCents).toBe(100_00 - 900_00 - 30_00);
    expect(r.days[1]!.endBalanceCents).toBeLessThan(0);
  });

  it('rejects nonsensical inputs', () => {
    const base = {
      startISO: '2026-07-01',
      horizonDays: 7,
      startingBalanceCents: 0,
      events: [],
      dailyDiscretionaryCents: 0,
    };
    expect(() => projectCashFlow({ ...base, horizonDays: 0 })).toThrow();
    expect(() => projectCashFlow({ ...base, horizonDays: 1.5 })).toThrow();
    expect(() => projectCashFlow({ ...base, dailyDiscretionaryCents: -1 })).toThrow();
    expect(() => projectCashFlow({ ...base, startISO: 'not-a-date' })).toThrow();
  });
});
