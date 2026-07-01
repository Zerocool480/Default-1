import { describe, expect, it } from 'vitest';
import { computeGoalEta, refineEtaWithSurplus } from './eta';

describe('computeGoalEta', () => {
  it('computes months-to-target on a monthly schedule', () => {
    // $1,300 of $2,000 at $150/mo → 5 contributions → lands Dec 1.
    const r = computeGoalEta({
      todayISO: '2026-07-01',
      fundedCents: 1_300_00,
      targetCents: 2_000_00,
      monthlyContributionCents: 150_00,
    });
    expect(r.percentComplete).toBe(65);
    expect(r.monthsRemaining).toBe(5);
    expect(r.etaISO).toBe('2026-12-01');
  });

  it('a completed goal arrives today', () => {
    const r = computeGoalEta({
      todayISO: '2026-07-01',
      fundedCents: 2_000_00,
      targetCents: 2_000_00,
      monthlyContributionCents: 0,
    });
    expect(r).toEqual({ etaISO: '2026-07-01', percentComplete: 100, monthsRemaining: 0 });
  });

  it('no contribution and not funded → unreachable, shown honestly', () => {
    const r = computeGoalEta({
      todayISO: '2026-07-01',
      fundedCents: 500_00,
      targetCents: 2_000_00,
      monthlyContributionCents: 0,
    });
    expect(r.etaISO).toBeNull();
    expect(r.percentComplete).toBe(25);
  });

  it('year boundaries roll correctly', () => {
    const r = computeGoalEta({
      todayISO: '2026-11-15',
      fundedCents: 0,
      targetCents: 300_00,
      monthlyContributionCents: 100_00,
    });
    expect(r.etaISO).toBe('2027-02-01'); // Dec 1, Jan 1, Feb 1
  });

  it('caps pathological schedules instead of looping forever', () => {
    const r = computeGoalEta({
      todayISO: '2026-07-01',
      fundedCents: 0,
      targetCents: 100_000_000_00,
      monthlyContributionCents: 1_00,
    });
    expect(r.etaISO).toBeNull();
  });
});

describe('refineEtaWithSurplus', () => {
  const inputs = {
    todayISO: '2026-07-01',
    fundedCents: 1_300_00,
    targetCents: 2_000_00,
    monthlyContributionCents: 150_00,
  };

  it('pulls the ETA earlier when surplus alone gets there faster', () => {
    const base = computeGoalEta(inputs);
    const refined = refineEtaWithSurplus(base, { ...inputs, dailySurplusCents: 20_00 });
    // $700 remaining / $20/day = 35 days → Aug 5, earlier than Dec 1.
    expect(refined.etaISO).toBe('2026-08-05');
  });

  it('never pushes the ETA later', () => {
    const base = computeGoalEta(inputs);
    const refined = refineEtaWithSurplus(base, { ...inputs, dailySurplusCents: 1 });
    expect(refined.etaISO).toBe(base.etaISO);
  });

  it('leaves unreachable goals unreachable', () => {
    const base = computeGoalEta({ ...inputs, monthlyContributionCents: 0 });
    const refined = refineEtaWithSurplus(base, {
      ...inputs,
      monthlyContributionCents: 0,
      dailySurplusCents: 0,
    });
    expect(refined.etaISO).toBeNull();
  });
});
