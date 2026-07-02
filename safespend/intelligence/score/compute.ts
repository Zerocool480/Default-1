/**
 * Financial Health Score — pure core. Spec: docs/budget/PRD.md §8.
 *
 * Eight pillars, each 0–100 with a fixed weight and a reasons list; the
 * composite is the weighted average. Deterministic piecewise heuristics —
 * every point of every pillar can be explained from its inputs. Pillars
 * without enough data score a neutral 60 and say so, rather than flattering
 * or punishing a new user.
 */

export interface ScoreInputs {
  /** Trailing ~90 days, magnitudes in cents. */
  inflow90Cents: number;
  outflow90Cents: number;
  /** Emergency cushion vs. monthly essential spending. */
  emergencyFundedCents: number;
  monthlyEssentialsCents: number;
  /** Credit utilization across cards. Nulls when the user has no cards. */
  creditUsedCents: number | null;
  creditLimitCents: number | null;
  /** This period's committed money is fully covered (engine raw pool ≥ 0). */
  billsCoveredNow: boolean;
  /** 60-day projection stays above zero. */
  forecastStaysPositive: boolean;
  /** Share of tracked days (last 30) spent within the daily allowance; null < 7 days of data. */
  disciplineRatio: number | null;
  /** Goal contributions + savings as a share of income (90d); null without income data. */
  savingsRate: number | null;
  /** Active goals currently on pace (ETA ≤ target date, or any ETA when no target). */
  goalsOnPace: number;
  goalsTotal: number;
  /** (assets − liabilities) change over ~90 days as a fraction; null < 2 datapoints. */
  netWorthChangePct: number | null;
}

export interface PillarScore {
  key:
    | 'cash_flow'
    | 'emergency_fund'
    | 'debt'
    | 'bills'
    | 'discipline'
    | 'savings_rate'
    | 'goal_progress'
    | 'net_worth_trend';
  label: string;
  score: number; // 0–100
  weight: number; // fractions summing to 1
  reasons: string[];
}

export interface HealthScore {
  total: number; // 0–100
  pillars: PillarScore[];
}

const NEUTRAL = 60;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** Piecewise-linear interpolation over [x0,y0]→[x1,y1] with clamping. */
const lerp = (x: number, x0: number, y0: number, x1: number, y1: number) =>
  clamp(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function computeHealthScore(i: ScoreInputs): HealthScore {
  const pillars: PillarScore[] = [];

  // Cash flow (20%): are you living below your means?
  {
    let score: number;
    const reasons: string[] = [];
    if (i.outflow90Cents <= 0) {
      score = NEUTRAL;
      reasons.push('Not enough spending history yet to judge cash flow.');
    } else {
      const ratio = i.inflow90Cents / i.outflow90Cents;
      // breakeven → 70; spending 20%+ less than income → 100; 30% overspend → 0.
      score = ratio >= 1 ? lerp(ratio, 1.0, 70, 1.2, 100) : lerp(ratio, 0.7, 0, 1.0, 70);
      reasons.push(
        ratio >= 1
          ? `You earned ${pct(ratio - 1)} more than you spent over ~90 days.`
          : `You spent ${pct(1 - ratio)} more than you earned over ~90 days.`,
      );
    }
    pillars.push({ key: 'cash_flow', label: 'Cash Flow', score, weight: 0.2, reasons });
  }

  // Emergency fund (15%): months of essentials covered, target 3.
  {
    let score: number;
    const reasons: string[] = [];
    if (i.monthlyEssentialsCents <= 0) {
      score = NEUTRAL;
      reasons.push('Confirm your essential bills so this can be measured.');
    } else {
      const months = i.emergencyFundedCents / i.monthlyEssentialsCents;
      score = clamp((months / 3) * 100);
      reasons.push(
        `${months.toFixed(1)} month${months >= 1.05 ? 's' : ''} of essentials covered (target: 3).`,
      );
    }
    pillars.push({ key: 'emergency_fund', label: 'Emergency Fund', score, weight: 0.15, reasons });
  }

  // Debt (15%): credit utilization.
  {
    let score: number;
    const reasons: string[] = [];
    if (i.creditUsedCents === null || i.creditLimitCents === null || i.creditLimitCents <= 0) {
      score = 85; // no revolving debt tracked is healthy, not neutral
      reasons.push('No credit card debt tracked.');
    } else {
      const util = i.creditUsedCents / i.creditLimitCents;
      // ≤10% → 100; 30% → 70; 100% → 0.
      score = util <= 0.3 ? lerp(util, 0.1, 100, 0.3, 70) : lerp(util, 0.3, 70, 1.0, 0);
      reasons.push(`Credit utilization is ${pct(util)}${util > 0.3 ? ' — above the 30% line.' : '.'}`);
    }
    pillars.push({ key: 'debt', label: 'Debt', score, weight: 0.15, reasons });
  }

  // Bills (15%): committed money covered now and over the horizon.
  {
    const score = i.billsCoveredNow && i.forecastStaysPositive ? 100 : i.billsCoveredNow ? 75 : 30;
    const reasons = [
      i.billsCoveredNow
        ? 'Everything due before your next paycheck is covered.'
        : 'Committed money before your next paycheck is not fully covered.',
    ];
    if (i.billsCoveredNow && !i.forecastStaysPositive) {
      reasons.push('The 60-day projection dips below zero — see the calendar.');
    }
    pillars.push({ key: 'bills', label: 'Bills', score, weight: 0.15, reasons });
  }

  // Spending discipline (15%): days within allowance, last 30.
  {
    let score: number;
    const reasons: string[] = [];
    if (i.disciplineRatio === null) {
      score = NEUTRAL;
      reasons.push('Less than a week of allowance history — keep using the app.');
    } else {
      score = clamp(i.disciplineRatio * 100);
      reasons.push(`Stayed within the daily allowance on ${pct(i.disciplineRatio)} of tracked days.`);
    }
    pillars.push({ key: 'discipline', label: 'Discipline', score, weight: 0.15, reasons });
  }

  // Savings rate (10%): 20%+ of income → 100.
  {
    let score: number;
    const reasons: string[] = [];
    if (i.savingsRate === null) {
      score = NEUTRAL;
      reasons.push('No income history yet to measure a savings rate against.');
    } else {
      score = clamp((i.savingsRate / 0.2) * 100);
      reasons.push(`Saving ${pct(i.savingsRate)} of income (target: 20%).`);
    }
    pillars.push({ key: 'savings_rate', label: 'Savings Rate', score, weight: 0.1, reasons });
  }

  // Goal progress (5%).
  {
    let score: number;
    const reasons: string[] = [];
    if (i.goalsTotal === 0) {
      score = NEUTRAL;
      reasons.push('No goals yet — add one to give your money a direction.');
    } else {
      score = clamp((i.goalsOnPace / i.goalsTotal) * 100);
      reasons.push(`${i.goalsOnPace} of ${i.goalsTotal} goals on pace.`);
    }
    pillars.push({ key: 'goal_progress', label: 'Goal Progress', score, weight: 0.05, reasons });
  }

  // Net-worth trend (5%).
  {
    let score: number;
    const reasons: string[] = [];
    if (i.netWorthChangePct === null) {
      score = NEUTRAL;
      reasons.push('Net-worth trend needs more history.');
    } else {
      // −5% → 20, flat → 70, +2%+ → 100.
      score =
        i.netWorthChangePct >= 0
          ? lerp(i.netWorthChangePct, 0, 70, 0.02, 100)
          : lerp(i.netWorthChangePct, -0.05, 20, 0, 70);
      reasons.push(
        `Net worth ${i.netWorthChangePct >= 0 ? 'up' : 'down'} ${pct(Math.abs(i.netWorthChangePct))} over ~90 days.`,
      );
    }
    pillars.push({ key: 'net_worth_trend', label: 'Net Worth Trend', score, weight: 0.05, reasons });
  }

  const total = clamp(pillars.reduce((sum, p) => sum + p.score * p.weight, 0));
  return { total, pillars };
}
