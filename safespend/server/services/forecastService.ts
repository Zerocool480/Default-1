import { and, eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { toCents } from '../../shared/money';
import { addDays, compareISO } from '../../shared/dates';
import type { ForecastEvent, ForecastResult } from '../../shared/forecast';
import { projectCashFlow } from '../../intelligence/forecast/project';
import { expandOccurrences, type Frequency } from '../../intelligence/forecast/expand';

/**
 * Build dated forecast events for a user within [fromISO, toISO):
 * confirmed recurring streams (expanded), liability minimum payments, and
 * future planned transactions. Natural sign: inflows +, outflows −.
 */
export async function buildForecastEvents(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<ForecastEvent[]> {
  const events: ForecastEvent[] = [];

  const streams = await db
    .select()
    .from(schema.recurringStreams)
    .where(
      and(eq(schema.recurringStreams.userId, userId), eq(schema.recurringStreams.status, 'confirmed')),
    );

  for (const s of streams) {
    if (!s.nextExpectedDate) continue;
    const magnitude = toCents(s.averageAmount);
    const signed = s.direction === 'inflow' ? magnitude : -magnitude;
    for (const dateISO of expandOccurrences(
      s.nextExpectedDate,
      s.frequency as Frequency,
      fromISO,
      toISO,
    )) {
      events.push({
        id: s.id,
        dateISO,
        amountCents: signed,
        label: s.description,
        type: s.direction === 'inflow' ? 'paycheck' : 'bill',
      });
    }
  }

  // Credit-card / loan minimums come from liabilities, not streams, so they
  // are never double-counted (seed and sync both follow this rule).
  const liabilityRows = await db
    .select({ liability: schema.liabilities, account: schema.accounts })
    .from(schema.liabilities)
    .innerJoin(schema.accounts, eq(schema.liabilities.accountId, schema.accounts.id))
    .where(eq(schema.accounts.userId, userId));

  for (const { liability, account } of liabilityRows) {
    if (!liability.minPayment || !liability.nextDueDate) continue;
    for (const dateISO of expandOccurrences(liability.nextDueDate, 'monthly', fromISO, toISO)) {
      events.push({
        id: `liability:${liability.accountId}`,
        dateISO,
        amountCents: -toCents(liability.minPayment),
        label: `${account.name} payment`,
        type: 'debt_payment',
      });
    }
  }

  const planned = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.source, 'planned')));
  for (const t of planned) {
    if (compareISO(t.date, fromISO) < 0 || compareISO(t.date, toISO) >= 0) continue;
    events.push({
      id: t.id,
      dateISO: t.date,
      amountCents: -toCents(t.amount), // Plaid sign (+out) → natural sign
      label: t.name,
      type: 'planned',
    });
  }

  return events;
}

export async function forecastForUser(
  userId: string,
  opts: {
    todayISO: string;
    startingBalanceCents: number;
    horizonDays: number;
    dailyDiscretionaryCents: number;
  },
): Promise<ForecastResult> {
  const startISO = addDays(opts.todayISO, 1); // today's balance is the anchor
  const endISO = addDays(startISO, opts.horizonDays);
  const events = await buildForecastEvents(userId, startISO, endISO);
  return projectCashFlow({
    startISO,
    horizonDays: opts.horizonDays,
    startingBalanceCents: opts.startingBalanceCents,
    events,
    dailyDiscretionaryCents: opts.dailyDiscretionaryCents,
  });
}
