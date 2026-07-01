/**
 * Goal GPS — estimated arrival dates. Spec: docs/budget/PRD.md §6.
 *
 * v1 model: contributions land monthly on the user's contribution day
 * (defaulting to the 1st). ETA is the first date the funded amount reaches
 * the target. Deliberately simple and explainable; the forecast-surplus
 * refinement comes later and lives here when it does.
 */
import { addDays, assertISODate, compareISO, firstOfNextMonth } from '../../shared/dates';

export interface GoalEtaInputs {
  todayISO: string;
  fundedCents: number;
  targetCents: number;
  monthlyContributionCents: number;
}

export interface GoalEta {
  etaISO: string | null; // null = unreachable on current schedule
  percentComplete: number; // 0–100, 2dp
  monthsRemaining: number | null;
}

/** Hard cap so a $5/mo contribution to a $1M goal terminates: 50 years. */
const MAX_MONTHS = 600;

export function computeGoalEta(inputs: GoalEtaInputs): GoalEta {
  const { todayISO, fundedCents, targetCents, monthlyContributionCents } = inputs;
  assertISODate(todayISO);
  if (targetCents <= 0) throw new Error('targetCents must be positive');
  if (fundedCents < 0 || monthlyContributionCents < 0) {
    throw new Error('fundedCents and monthlyContributionCents are magnitudes');
  }

  const percentComplete =
    Math.round(Math.min(100, (fundedCents / targetCents) * 100) * 100) / 100;

  if (fundedCents >= targetCents) {
    return { etaISO: todayISO, percentComplete: 100, monthsRemaining: 0 };
  }
  if (monthlyContributionCents === 0) {
    return { etaISO: null, percentComplete, monthsRemaining: null };
  }

  let funded = fundedCents;
  let date = firstOfNextMonth(todayISO); // next contribution lands on the 1st
  for (let months = 1; months <= MAX_MONTHS; months++) {
    funded += monthlyContributionCents;
    if (funded >= targetCents) {
      return { etaISO: date, percentComplete, monthsRemaining: months };
    }
    date = firstOfNextMonth(date);
  }
  return { etaISO: null, percentComplete, monthsRemaining: null };
}

/**
 * Refine a schedule-based ETA with observed saving pace: if the user also
 * accumulates daily surplus toward the goal (e.g. linked account grows faster
 * than the schedule), the ETA pulls in. v1 keeps this conservative: surplus
 * only ever moves the date EARLIER, never later, and never earlier than today.
 */
export function refineEtaWithSurplus(
  base: GoalEta,
  inputs: GoalEtaInputs & { dailySurplusCents: number },
): GoalEta {
  const { todayISO, fundedCents, targetCents, dailySurplusCents } = inputs;
  if (dailySurplusCents <= 0 || base.etaISO === null) return base;
  const remaining = targetCents - fundedCents;
  if (remaining <= 0) return base;
  const daysBySurplusAlone = Math.ceil(remaining / dailySurplusCents);
  const surplusISO = addDays(todayISO, daysBySurplusAlone);
  return compareISO(surplusISO, base.etaISO) < 0 ? { ...base, etaISO: surplusISO } : base;
}
