import { describe, expect, it } from 'vitest';
import { computeSafeToSpend } from './compute';
import type { EngineInputs, ObligationInput } from '../../shared/engine';

const bill = (
  id: string,
  label: string,
  amountCents: number,
  dueDateISO: string,
  kind: ObligationInput['kind'] = 'bill',
): ObligationInput => ({ id, label, amountCents, dueDateISO, kind });

/** PRD §4.3 example: the golden "normal month" scenario. */
const base: EngineInputs = {
  todayISO: '2026-07-01',
  periodEndISO: '2026-07-15',
  periodSource: 'next_paycheck',
  availableCashCents: 2_310_00,
  obligations: [
    bill('rent', 'Rent', 900_00, '2026-07-03'),
    bill('electric', 'Electric', 68_51, '2026-07-11'),
    bill('spotify', 'Spotify', 11_49, '2026-07-09'),
    bill('visa', 'Visa minimum', 250_00, '2026-07-10', 'debt_minimum'),
  ],
  goalReserveCents: 150_00,
  emergencyFloorCents: 500_00,
  spentTodayCents: 0,
  forecastMinBalanceCents: null,
};

describe('computeSafeToSpend — golden scenarios', () => {
  it('normal month: matches the hand-computed PRD example', () => {
    const r = computeSafeToSpend(base);
    // 2310 − (900 + 68.51 + 11.49 + 250) − 150 − 500 = 430.00, over 14 days
    expect(r.rawPoolCents).toBe(430_00);
    expect(r.discretionaryPoolCents).toBe(430_00);
    expect(r.daysLeft).toBe(14);
    expect(r.dailyAllowanceCents).toBe(30_71); // floor(43000/14) = 3071
    expect(r.safeToSpendTodayCents).toBe(30_71);
    expect(r.status).toBe('ok');
    expect(r.recovery).toBeNull();
  });

  it('spending during the day reduces today, not the pool', () => {
    const r = computeSafeToSpend({ ...base, spentTodayCents: 12_80 });
    expect(r.dailyAllowanceCents).toBe(30_71);
    expect(r.safeToSpendTodayCents).toBe(30_71 - 12_80);
    expect(r.status).toBe('ok');
  });

  it('underspend rolls forward: fewer days + untouched pool raises the allowance', () => {
    // Same finances five days later, nothing spent, no bills paid yet except rent.
    const later = computeSafeToSpend({
      ...base,
      todayISO: '2026-07-06',
      availableCashCents: 2_310_00 - 900_00, // rent paid
      obligations: base.obligations.filter((o) => o.id !== 'rent'),
    });
    expect(later.rawPoolCents).toBe(430_00); // pool unchanged — underspend preserved
    expect(later.daysLeft).toBe(9);
    expect(later.dailyAllowanceCents).toBe(47_77); // floor(43000/9)
    expect(later.dailyAllowanceCents).toBeGreaterThan(30_71);
  });

  it('overspend redistributes: a hot day lowers every remaining day', () => {
    // Day 1: spent $80 of a $30.71 allowance. Tomorrow the pool is $49.29 lighter.
    const tomorrow = computeSafeToSpend({
      ...base,
      todayISO: '2026-07-02',
      availableCashCents: base.availableCashCents - 80_00,
      spentTodayCents: 0,
    });
    expect(tomorrow.rawPoolCents).toBe(350_00);
    expect(tomorrow.daysLeft).toBe(13);
    expect(tomorrow.dailyAllowanceCents).toBe(26_92); // redistributed, lower than 30.71
  });

  it('overspending today clamps today to $0 but stays explainable', () => {
    const r = computeSafeToSpend({ ...base, spentTodayCents: 55_00 });
    expect(r.safeToSpendTodayCents).toBe(0);
    expect(r.status).toBe('hold');
    expect(r.recovery).toBeNull(); // pool still positive; it's a today-only hold
    expect(r.lineItems.at(-1)).toMatchObject({ kind: 'spent', amountCents: -55_00 });
  });

  it('negative pool: $0 + recovery plan, never a negative number', () => {
    const r = computeSafeToSpend({ ...base, availableCashCents: 1_500_00 });
    // 1500 − 1230 − 150 − 500 = −380
    expect(r.rawPoolCents).toBe(-380_00);
    expect(r.discretionaryPoolCents).toBe(0);
    expect(r.safeToSpendTodayCents).toBe(0);
    expect(r.status).toBe('hold');
    expect(r.recovery).toEqual({
      shortfallCents: 380_00,
      perDayCents: Math.ceil(380_00 / 14), // 2715 — round UP: recover faster, not slower
    });
  });

  it('payday tomorrow: one-day period, whole pool available today', () => {
    const r = computeSafeToSpend({
      ...base,
      todayISO: '2026-07-14',
      periodEndISO: '2026-07-15',
      obligations: [],
      availableCashCents: 800_00,
    });
    expect(r.daysLeft).toBe(1);
    expect(r.dailyAllowanceCents).toBe(800_00 - 150_00 - 500_00);
  });

  it('obligations outside the period are ignored even if the caller passes them', () => {
    const r = computeSafeToSpend({
      ...base,
      obligations: [
        ...base.obligations,
        bill('car', 'Car insurance', 400_00, '2026-07-20'), // after payday
        bill('old', 'Already past', 100_00, '2026-06-28'), // before today
      ],
    });
    expect(r.rawPoolCents).toBe(430_00);
    const labels = r.lineItems.map((li) => li.label).join('|');
    expect(labels).not.toContain('Car insurance');
    expect(labels).not.toContain('Already past');
  });

  it('an obligation due today still counts (inclusive lower bound)', () => {
    const r = computeSafeToSpend({
      ...base,
      obligations: [bill('rent', 'Rent', 900_00, '2026-07-01')],
    });
    expect(r.rawPoolCents).toBe(2_310_00 - 900_00 - 150_00 - 500_00);
  });

  it('forecast clamp: a projected dip below the floor shrinks the pool by the dip', () => {
    const r = computeSafeToSpend({ ...base, forecastMinBalanceCents: 380_00 });
    // dip = 500 − 380 = 120 held back
    expect(r.clampedByForecastCents).toBe(120_00);
    expect(r.rawPoolCents).toBe(430_00 - 120_00);
    expect(r.lineItems.some((li) => li.kind === 'forecast_clamp')).toBe(true);
  });

  it('forecast above the floor clamps nothing', () => {
    const r = computeSafeToSpend({ ...base, forecastMinBalanceCents: 900_00 });
    expect(r.clampedByForecastCents).toBe(0);
    expect(r.rawPoolCents).toBe(430_00);
  });

  it('tight status below $15/day allowance', () => {
    const r = computeSafeToSpend({
      ...base,
      availableCashCents: 2_030_00, // 1230 bills + 150 goal + 500 floor + $150 pool → $10.71/day
    });
    expect(r.dailyAllowanceCents).toBe(10_71);
    expect(r.status).toBe('tight');
  });

  it('rounding always favors caution and stays in integer cents', () => {
    const r = computeSafeToSpend({
      ...base,
      obligations: [],
      goalReserveCents: 0,
      emergencyFloorCents: 0,
      availableCashCents: 1_00, // $1 over 14 days
    });
    expect(r.dailyAllowanceCents).toBe(7); // floor(100/14), not 7.14
    expect(Number.isInteger(r.safeToSpendTodayCents)).toBe(true);
  });

  it('line items always sum-check: cash + deductions = raw pool', () => {
    const r = computeSafeToSpend({ ...base, forecastMinBalanceCents: 380_00 });
    const sum = r.lineItems
      .filter((li) => li.kind !== 'divide' && li.kind !== 'spent')
      .reduce((s, li) => s + li.amountCents, 0);
    expect(sum).toBe(r.rawPoolCents);
  });

  it('rejects nonsensical inputs loudly', () => {
    expect(() => computeSafeToSpend({ ...base, periodEndISO: '2026-07-01' })).toThrow();
    expect(() => computeSafeToSpend({ ...base, periodEndISO: '2026-06-15' })).toThrow();
    expect(() => computeSafeToSpend({ ...base, spentTodayCents: -5 })).toThrow();
    expect(() =>
      computeSafeToSpend({
        ...base,
        obligations: [bill('bad', 'Negative bill', -100, '2026-07-05')],
      }),
    ).toThrow();
  });
});
