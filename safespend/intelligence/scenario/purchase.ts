/**
 * Purchase scenario evaluation — pure core (PRD §9). Runs the same engine and
 * forecast functions with and without the hypothetical purchase and diffs the
 * results. No I/O, no writes: a simulation can never touch real data.
 */
import type { EngineInputs } from '../../shared/engine';
import type { ForecastInputs } from '../../shared/forecast';
import type { PurchaseEvaluation, PurchaseImpact } from '../../shared/scenario';
import { computeSafeToSpend } from '../engine/compute';
import { projectCashFlow } from '../forecast/project';
import { compareISO, formatShort } from '../../shared/dates';
import { formatCents } from '../../shared/money';

export interface PurchaseInputs {
  amountCents: number;
  /** Defaults to today (spend it now). Must be within [today, periodEnd) to
   *  affect the current period's pool; later dates only affect the forecast. */
  dateISO?: string;
  label?: string;
}

export function evaluatePurchase(
  engineInputs: EngineInputs,
  forecastInputs: ForecastInputs,
  purchase: PurchaseInputs,
): PurchaseEvaluation {
  if (purchase.amountCents <= 0) throw new Error('Purchase amount must be positive');
  const dateISO = purchase.dateISO ?? engineInputs.todayISO;
  if (compareISO(dateISO, engineInputs.todayISO) < 0) {
    throw new Error('Cannot simulate a purchase in the past');
  }
  const label = purchase.label?.trim() || 'This purchase';
  const isToday = dateISO === engineInputs.todayISO;
  const inPeriod = compareISO(dateISO, engineInputs.periodEndISO) < 0;

  // Baseline (with each side's own forecast clamp, so both are honest).
  const forecastBefore = projectCashFlow(forecastInputs);
  const before = computeSafeToSpend({
    ...engineInputs,
    forecastMinBalanceCents: forecastBefore.minDay.endBalanceCents,
  });

  // With the purchase: money leaves the pool (and counts as spent today when
  // bought today); the forecast carries it as a planned event on its date.
  const forecastAfter = projectCashFlow({
    ...forecastInputs,
    startingBalanceCents: isToday
      ? forecastInputs.startingBalanceCents - purchase.amountCents
      : forecastInputs.startingBalanceCents,
    events: isToday
      ? forecastInputs.events
      : [
          ...forecastInputs.events,
          {
            id: 'simulated-purchase',
            dateISO,
            amountCents: -purchase.amountCents,
            label,
            type: 'planned' as const,
          },
        ],
  });
  const after = computeSafeToSpend({
    ...engineInputs,
    availableCashCents: inPeriod
      ? engineInputs.availableCashCents - purchase.amountCents
      : engineInputs.availableCashCents,
    spentTodayCents: engineInputs.spentTodayCents + (isToday ? purchase.amountCents : 0),
    forecastMinBalanceCents: forecastAfter.minDay.endBalanceCents,
  });

  const floor = engineInputs.emergencyFloorCents;
  // Bills coverage is judged before the forecast clamp (rawPool already
  // includes the clamp as a deduction, so add it back): a projected dip is a
  // cushion problem, not a missed bill, and gets its own impact line.
  const billsCovered = after.rawPoolCents + after.clampedByForecastCents >= 0;
  const floorSafe = forecastAfter.minDay.endBalanceCents >= floor;

  const verdict = billsCovered && floorSafe ? 'yes' : billsCovered ? 'tight' : 'not_now';
  const risk = verdict === 'yes' ? 'low' : verdict === 'tight' ? 'moderate' : 'high';

  const impacts: PurchaseImpact[] = [];
  if (billsCovered) {
    impacts.push({
      kind: 'bills_covered',
      tone: 'good',
      text: 'All bills before your next paycheck stay fully covered.',
    });
  } else {
    const short = -(after.rawPoolCents + after.clampedByForecastCents);
    const eatsGoals = Math.min(short, engineInputs.goalReserveCents);
    impacts.push({
      kind: 'bills_short',
      tone: 'warn',
      text: `This would leave you ${formatCents(short)} short of what's already committed before ${formatShort(engineInputs.periodEndISO)}${
        eatsGoals > 0 ? ` — starting with money reserved for your goals (${formatCents(eatsGoals)})` : ''
      }.`,
      data: { shortCents: short },
    });
  }
  if (floorSafe) {
    impacts.push({
      kind: 'floor_safe',
      tone: 'good',
      text: 'Your emergency floor stays untouched over the next 60 days.',
    });
  } else {
    const dip = floor - forecastAfter.minDay.endBalanceCents;
    impacts.push({
      kind: 'floor_dip',
      tone: 'warn',
      text: `Projected cash dips ${formatCents(dip)} below your emergency floor around ${formatShort(forecastAfter.minDay.dateISO)}.`,
      data: { dipCents: dip, dateISO: forecastAfter.minDay.dateISO },
    });
  }
  if (inPeriod && before.dailyAllowanceCents > 0) {
    impacts.push({
      kind: 'allowance_change',
      tone: 'change',
      text: `Daily allowance: ${formatCents(before.dailyAllowanceCents)} → ${formatCents(after.dailyAllowanceCents)}/day until ${formatShort(engineInputs.periodEndISO)}.`,
      data: {
        beforeCents: before.dailyAllowanceCents,
        afterCents: after.dailyAllowanceCents,
      },
    });
    const days = purchase.amountCents / before.dailyAllowanceCents;
    impacts.push({
      kind: 'days_of_spending',
      tone: 'change',
      text: `That's ${days < 10 ? days.toFixed(1) : Math.round(days)} day${days >= 1.05 ? 's' : ''} of spending money.`,
      data: { days: Math.round(days * 10) / 10 },
    });
  }

  const headline =
    verdict === 'yes'
      ? 'Yes, you can afford this.'
      : verdict === 'tight'
        ? 'Doable, but it cuts into your cushion.'
        : "Hold off — this would break commitments.";

  return {
    verdict,
    risk,
    headline,
    impacts,
    before,
    after,
    forecastMinBeforeCents: forecastBefore.minDay.endBalanceCents,
    forecastMinAfterCents: forecastAfter.minDay.endBalanceCents,
  };
}
