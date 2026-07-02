import { describe, expect, it } from 'vitest';
import { evaluatePurchase } from './purchase';
import type { EngineInputs } from '../../shared/engine';
import type { ForecastInputs } from '../../shared/forecast';

/** $430 pool over 14 days, floor $500, paycheck lands on the 15th. */
const engineInputs: EngineInputs = {
  todayISO: '2026-07-01',
  periodEndISO: '2026-07-15',
  periodSource: 'next_paycheck',
  availableCashCents: 2_310_00,
  obligations: [
    { id: 'rent', label: 'Rent', amountCents: 980_00, dueDateISO: '2026-07-03', kind: 'bill' },
    { id: 'visa', label: 'Visa', amountCents: 250_00, dueDateISO: '2026-07-10', kind: 'debt_minimum' },
  ],
  goalReserveCents: 150_00,
  emergencyFloorCents: 500_00,
  spentTodayCents: 0,
  forecastMinBalanceCents: null,
};

const forecastInputs: ForecastInputs = {
  startISO: '2026-07-02',
  horizonDays: 30,
  startingBalanceCents: 2_310_00,
  events: [
    { id: 'rent', dateISO: '2026-07-03', amountCents: -980_00, label: 'Rent', type: 'bill' },
    { id: 'visa', dateISO: '2026-07-10', amountCents: -250_00, label: 'Visa', type: 'debt_payment' },
    { id: 'pay', dateISO: '2026-07-15', amountCents: 2_140_00, label: 'Paycheck', type: 'paycheck' },
  ],
  dailyDiscretionaryCents: 0,
};

describe('evaluatePurchase', () => {
  it('affordable purchase: yes / low risk, allowance math exact', () => {
    const r = evaluatePurchase(engineInputs, forecastInputs, { amountCents: 100_00 });
    expect(r.verdict).toBe('yes');
    expect(r.risk).toBe('low');
    // pool 930 (no clamp: forecast min 580 ≥ 500)… wait: 2310−980−250−150−500 = 430
    expect(r.before.rawPoolCents).toBe(430_00);
    expect(r.after.rawPoolCents).toBe(330_00);
    expect(r.after.dailyAllowanceCents).toBe(Math.floor(330_00 / 14));
    // Spent-today counts the purchase immediately.
    expect(r.after.spentTodayCents).toBe(100_00);
    expect(r.impacts.some((i) => i.kind === 'bills_covered')).toBe(true);
    expect(r.impacts.some((i) => i.kind === 'allowance_change')).toBe(true);
  });

  it('floor dip → tight / moderate risk with the dip explained', () => {
    // A big bill lands AFTER payday: this period's bills stay covered, but
    // the 60-day projection dips near the floor — exactly the case the clamp
    // and the "tight" verdict exist for.
    const tightForecast = {
      ...forecastInputs,
      events: [
        ...forecastInputs.events,
        { id: 'ins', dateISO: '2026-07-20', amountCents: -3_000_00, label: 'Insurance', type: 'bill' as const },
      ],
    };
    // Forecast min before: 2310−980−250+2140−3000 = 220 (< 500 floor already).
    const r = evaluatePurchase(engineInputs, tightForecast, { amountCents: 100_00 });
    expect(r.verdict).toBe('tight');
    expect(r.risk).toBe('moderate');
    const dip = r.impacts.find((i) => i.kind === 'floor_dip');
    expect(dip).toBeDefined();
    expect(dip!.data?.dipCents).toBe(500_00 - (220_00 - 100_00)); // 380.00
    // Bills line stays positive — the dip is a cushion warning, not a miss.
    expect(r.impacts.some((i) => i.kind === 'bills_covered')).toBe(true);
  });

  it('unaffordable purchase: not_now / high risk, names the goal money at stake', () => {
    const r = evaluatePurchase(engineInputs, forecastInputs, { amountCents: 500_00 });
    // after pool = 430 − 500 = −70 → breaks commitments
    expect(r.verdict).toBe('not_now');
    expect(r.risk).toBe('high');
    const short = r.impacts.find((i) => i.kind === 'bills_short');
    expect(short).toBeDefined();
    expect(short!.data?.shortCents).toBe(70_00);
    expect(short!.text).toContain('goals');
    // Never a negative display number.
    expect(r.after.safeToSpendTodayCents).toBe(0);
  });

  it('future-dated purchase within the period reduces the pool but not spentToday', () => {
    const r = evaluatePurchase(engineInputs, forecastInputs, {
      amountCents: 100_00,
      dateISO: '2026-07-08',
    });
    expect(r.after.rawPoolCents).toBe(330_00);
    expect(r.after.spentTodayCents).toBe(0);
  });

  it('purchase after payday leaves this period alone; forecast carries it', () => {
    const r = evaluatePurchase(engineInputs, forecastInputs, {
      amountCents: 300_00,
      dateISO: '2026-07-20',
    });
    expect(r.after.rawPoolCents).toBe(r.before.rawPoolCents);
    expect(r.forecastMinAfterCents).toBeLessThanOrEqual(r.forecastMinBeforeCents);
  });

  it('simulation is pure: inputs are not mutated', () => {
    const engineCopy = JSON.parse(JSON.stringify(engineInputs));
    const forecastCopy = JSON.parse(JSON.stringify(forecastInputs));
    evaluatePurchase(engineInputs, forecastInputs, { amountCents: 999_99 });
    expect(engineInputs).toEqual(engineCopy);
    expect(forecastInputs).toEqual(forecastCopy);
  });

  it('rejects nonsense', () => {
    expect(() => evaluatePurchase(engineInputs, forecastInputs, { amountCents: 0 })).toThrow();
    expect(() =>
      evaluatePurchase(engineInputs, forecastInputs, { amountCents: 100, dateISO: '2026-06-30' }),
    ).toThrow();
  });
});
