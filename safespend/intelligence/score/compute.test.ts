import { describe, expect, it } from 'vitest';
import { computeHealthScore, type ScoreInputs } from './compute';

const healthy: ScoreInputs = {
  inflow90Cents: 12_840_00,
  outflow90Cents: 10_500_00, // ratio ≈ 1.22 → 100
  emergencyFundedCents: 3_700_00,
  monthlyEssentialsCents: 1_500_00, // 2.47 months → 82
  creditUsedCents: 1_830_00,
  creditLimitCents: 6_000_00, // 30.5% util
  billsCoveredNow: true,
  forecastStaysPositive: true, // 100
  disciplineRatio: 0.9, // 90
  savingsRate: 0.14, // 70
  goalsOnPace: 2,
  goalsTotal: 2, // 100
  netWorthChangePct: 0.015, // 92-93
};

const pillar = (r: ReturnType<typeof computeHealthScore>, key: string) =>
  r.pillars.find((p) => p.key === key)!;

describe('computeHealthScore', () => {
  it('weights sum to 1 and every pillar carries a reason', () => {
    const r = computeHealthScore(healthy);
    expect(r.pillars.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 10);
    expect(r.pillars.every((p) => p.reasons.length > 0)).toBe(true);
    expect(r.pillars).toHaveLength(8);
  });

  it('scores a healthy profile high with exact pillar math', () => {
    const r = computeHealthScore(healthy);
    expect(pillar(r, 'cash_flow').score).toBe(100); // ratio ≥ 1.2
    expect(pillar(r, 'emergency_fund').score).toBe(82); // 2.47/3 months
    expect(pillar(r, 'bills').score).toBe(100);
    expect(pillar(r, 'discipline').score).toBe(90);
    expect(pillar(r, 'savings_rate').score).toBe(70); // 14% of 20% target
    expect(pillar(r, 'goal_progress').score).toBe(100);
    expect(r.total).toBeGreaterThanOrEqual(85);
    expect(r.total).toBeLessThanOrEqual(95);
  });

  it('is monotone: overspending scores worse than breakeven, breakeven worse than surplus', () => {
    const at = (inflow: number) =>
      computeHealthScore({ ...healthy, inflow90Cents: inflow }).pillars[0]!.score;
    expect(at(9_000_00)).toBeLessThan(at(10_500_00)); // overspend < breakeven
    expect(at(10_500_00)).toBeLessThan(at(12_840_00)); // breakeven < surplus
    expect(at(10_500_00)).toBe(70); // breakeven anchor
  });

  it('credit utilization crossing 30% costs points with attribution', () => {
    const low = computeHealthScore({ ...healthy, creditUsedCents: 600_00 }); // 10%
    const high = computeHealthScore({ ...healthy, creditUsedCents: 3_600_00 }); // 60%
    expect(pillar(low, 'debt').score).toBe(100);
    expect(pillar(high, 'debt').score).toBe(40); // lerp(0.6, 0.3→70, 1.0→0)
    expect(pillar(high, 'debt').reasons[0]).toContain('above the 30% line');
  });

  it('uncovered bills dominate the bills pillar', () => {
    const r = computeHealthScore({ ...healthy, billsCoveredNow: false });
    expect(pillar(r, 'bills').score).toBe(30);
  });

  it('missing data is neutral and says so — never flattering, never punitive', () => {
    const sparse = computeHealthScore({
      inflow90Cents: 0,
      outflow90Cents: 0,
      emergencyFundedCents: 0,
      monthlyEssentialsCents: 0,
      creditUsedCents: null,
      creditLimitCents: null,
      billsCoveredNow: true,
      forecastStaysPositive: true,
      disciplineRatio: null,
      savingsRate: null,
      goalsOnPace: 0,
      goalsTotal: 0,
      netWorthChangePct: null,
    });
    for (const key of ['cash_flow', 'emergency_fund', 'discipline', 'savings_rate', 'goal_progress', 'net_worth_trend']) {
      expect(pillar(sparse, key).score).toBe(60);
    }
    expect(pillar(sparse, 'debt').score).toBe(85); // no debt is genuinely good
    expect(sparse.total).toBeGreaterThan(55);
    expect(sparse.total).toBeLessThan(75);
  });

  it('total stays within 0–100 at the extremes', () => {
    const worst = computeHealthScore({
      inflow90Cents: 1_00,
      outflow90Cents: 10_000_00,
      emergencyFundedCents: 0,
      monthlyEssentialsCents: 2_000_00,
      creditUsedCents: 6_000_00,
      creditLimitCents: 6_000_00,
      billsCoveredNow: false,
      forecastStaysPositive: false,
      disciplineRatio: 0,
      savingsRate: 0,
      goalsOnPace: 0,
      goalsTotal: 3,
      netWorthChangePct: -0.4,
    });
    expect(worst.total).toBeGreaterThanOrEqual(0);
    expect(worst.total).toBeLessThanOrEqual(20);
  });
});
