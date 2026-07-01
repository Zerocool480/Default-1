/**
 * Cash-flow forecast — the pure core. Spec: docs/budget/PRD.md §7.
 *
 * A deterministic day-by-day ledger projection. One implementation feeds the
 * calendar, goal ETAs, the engine's dip-clamp, scenario diffs, and briefing
 * warnings (ADR-7) — nothing else in the codebase projects balances.
 */
import type { ForecastDay, ForecastInputs, ForecastResult } from '../../shared/forecast';
import { addDays, assertISODate, compareISO } from '../../shared/dates';

export function projectCashFlow(inputs: ForecastInputs): ForecastResult {
  const { startISO, horizonDays, startingBalanceCents, events, dailyDiscretionaryCents } = inputs;
  assertISODate(startISO);
  if (horizonDays < 1 || !Number.isInteger(horizonDays)) {
    throw new Error(`horizonDays must be a positive integer, got ${horizonDays}`);
  }
  if (dailyDiscretionaryCents < 0) {
    throw new Error('dailyDiscretionaryCents is a magnitude');
  }

  const endISO = addDays(startISO, horizonDays - 1);
  const byDate = new Map<string, typeof events>();
  for (const e of events) {
    assertISODate(e.dateISO);
    if (compareISO(e.dateISO, startISO) < 0 || compareISO(e.dateISO, endISO) > 0) continue;
    const list = byDate.get(e.dateISO) ?? [];
    list.push(e);
    byDate.set(e.dateISO, list);
  }

  const days: ForecastDay[] = [];
  let balance = startingBalanceCents;
  let minDay = { dateISO: startISO, endBalanceCents: Number.MAX_SAFE_INTEGER };

  for (let i = 0; i < horizonDays; i++) {
    const dateISO = addDays(startISO, i);
    const dayEvents = byDate.get(dateISO) ?? [];
    for (const e of dayEvents) balance += e.amountCents;
    balance -= dailyDiscretionaryCents;
    days.push({ dateISO, events: dayEvents, endBalanceCents: balance });
    if (balance < minDay.endBalanceCents) {
      minDay = { dateISO, endBalanceCents: balance };
    }
  }

  return { days, minDay, endBalanceCents: balance };
}
