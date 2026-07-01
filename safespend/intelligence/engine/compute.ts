/**
 * Daily Spending Engine — the pure core. Spec: docs/budget/PRD.md §4.
 *
 * No I/O, no clock, no randomness: every input arrives as data, so any
 * result is exactly reproducible from its snapshot. Rounding always favors
 * caution (allowance rounds down). A wrong number here is a P0; change this
 * file only with tests in the same commit.
 */
import type {
  EngineInputs,
  EngineLineItem,
  EngineResult,
  EngineStatus,
} from '../../shared/engine';
import { compareISO, diffDays, formatShort } from '../../shared/dates';

/** Status thresholds: "tight" when the allowance drops below $15/day. */
const TIGHT_ALLOWANCE_CENTS = 15_00;

export function computeSafeToSpend(inputs: EngineInputs): EngineResult {
  const {
    todayISO,
    periodEndISO,
    periodSource,
    availableCashCents,
    obligations,
    goalReserveCents,
    emergencyFloorCents,
    spentTodayCents,
    forecastMinBalanceCents,
  } = inputs;

  if (compareISO(periodEndISO, todayISO) <= 0) {
    throw new Error(`periodEnd (${periodEndISO}) must be after today (${todayISO})`);
  }
  for (const o of obligations) {
    if (o.amountCents < 0) throw new Error(`Obligation amounts are magnitudes: ${o.label}`);
  }
  if (goalReserveCents < 0 || emergencyFloorCents < 0 || spentTodayCents < 0) {
    throw new Error('goalReserve, emergencyFloor, and spentToday are magnitudes');
  }

  // Period covers today through the day before the next paycheck.
  const daysLeft = diffDays(todayISO, periodEndISO);

  // Only obligations actually inside the period count; the caller filters,
  // but the engine re-checks because correctness lives here.
  const dueObligations = obligations.filter(
    (o) => compareISO(o.dueDateISO, todayISO) >= 0 && compareISO(o.dueDateISO, periodEndISO) < 0,
  );
  const obligationsTotal = dueObligations.reduce((sum, o) => sum + o.amountCents, 0);

  // Forecast clamp (PRD §4.1): if the projected minimum balance over the
  // period dips below the emergency floor, shrink the pool by the dip so the
  // dip never happens. A missing forecast clamps nothing.
  const clampedByForecastCents =
    forecastMinBalanceCents === null
      ? 0
      : Math.max(0, emergencyFloorCents - forecastMinBalanceCents);

  const rawPoolCents =
    availableCashCents -
    obligationsTotal -
    goalReserveCents -
    emergencyFloorCents -
    clampedByForecastCents;
  const discretionaryPoolCents = Math.max(0, rawPoolCents);

  // Round down: never promise a cent the pool doesn't cover.
  const dailyAllowanceCents = Math.floor(discretionaryPoolCents / daysLeft);
  const safeToSpendTodayCents = Math.max(0, dailyAllowanceCents - spentTodayCents);

  // 'hold' means "don't spend more today" — either the pool is overcommitted
  // (recovery plan attached) or today's allowance is used up (pool positive,
  // tomorrow resets). The UI distinguishes the two via rawPoolCents.
  let status: EngineStatus;
  if (rawPoolCents <= 0 || safeToSpendTodayCents === 0) status = 'hold';
  else if (dailyAllowanceCents < TIGHT_ALLOWANCE_CENTS) status = 'tight';
  else status = 'ok';

  const recovery =
    rawPoolCents < 0
      ? {
          shortfallCents: -rawPoolCents,
          perDayCents: Math.ceil(-rawPoolCents / daysLeft),
        }
      : null;

  const lineItems: EngineLineItem[] = [
    { label: 'Available cash', amountCents: availableCashCents, kind: 'cash' },
    ...dueObligations.map<EngineLineItem>((o) => ({
      label: `${o.label} (due ${formatShort(o.dueDateISO)})`,
      amountCents: -o.amountCents,
      kind: 'obligation',
      refs: [o.id],
    })),
  ];
  if (goalReserveCents > 0) {
    lineItems.push({ label: 'Reserved for goals', amountCents: -goalReserveCents, kind: 'goal' });
  }
  lineItems.push({
    label: 'Emergency floor',
    amountCents: -emergencyFloorCents,
    kind: 'floor',
  });
  if (clampedByForecastCents > 0) {
    lineItems.push({
      label: 'Held back to avoid a forecast dip',
      amountCents: -clampedByForecastCents,
      kind: 'forecast_clamp',
    });
  }
  lineItems.push({
    label: `${daysLeft} day${daysLeft === 1 ? '' : 's'} until ${
      periodSource === 'next_paycheck' ? 'payday' : 'month end'
    } (${formatShort(periodEndISO)})`,
    amountCents: dailyAllowanceCents,
    kind: 'divide',
  });
  if (spentTodayCents > 0) {
    lineItems.push({ label: 'Spent today', amountCents: -spentTodayCents, kind: 'spent' });
  }

  return {
    safeToSpendTodayCents,
    dailyAllowanceCents,
    discretionaryPoolCents,
    rawPoolCents,
    daysLeft,
    periodEndISO,
    periodSource,
    status,
    lineItems,
    recovery,
    clampedByForecastCents,
    spentTodayCents,
  };
}
