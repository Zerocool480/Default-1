import { createHash } from 'node:crypto';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db, schema } from '../../db';
import { fromCents, toCents } from '../../shared/money';
import { compareISO, firstOfMonth, firstOfNextMonth, todayInTimezone } from '../../shared/dates';
import type { EngineInputs, EngineResult, ObligationInput } from '../../shared/engine';
import { computeSafeToSpend } from '../../intelligence/engine/compute';
import { forecastForUser } from './forecastService';

export type EngineTrigger = 'sync' | 'webhook' | 'rollover' | 'manual' | 'settings' | 'txn_edit';

/** Look past the current period for dips (next month's big bill). */
const CLAMP_HORIZON_DAYS = 60;

async function getSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  if (!settings) throw new Error(`No settings for user ${userId}`);
  return settings;
}

export async function buildEngineInputs(
  userId: string,
  todayISO: string,
): Promise<{ inputs: EngineInputs; availableCashCents: number }> {
  const settings = await getSettings(userId);

  // Period end: earliest confirmed income occurrence after today.
  const inflows = await db
    .select()
    .from(schema.recurringStreams)
    .where(
      and(
        eq(schema.recurringStreams.userId, userId),
        eq(schema.recurringStreams.status, 'confirmed'),
        eq(schema.recurringStreams.direction, 'inflow'),
      ),
    );
  let periodEndISO: string | null = null;
  for (const s of inflows) {
    if (!s.nextExpectedDate || compareISO(s.nextExpectedDate, todayISO) <= 0) continue;
    if (periodEndISO === null || compareISO(s.nextExpectedDate, periodEndISO) < 0) {
      periodEndISO = s.nextExpectedDate;
    }
  }
  const periodSource: EngineInputs['periodSource'] =
    periodEndISO !== null && settings.periodStrategy === 'next_income'
      ? 'next_paycheck'
      : 'calendar_month';
  if (periodSource === 'calendar_month' || periodEndISO === null) {
    periodEndISO = firstOfNextMonth(todayISO);
  }

  // Available cash across opted-in accounts.
  const accountRows = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.includeInCashPool, true)));
  const availableCashCents = accountRows.reduce(
    (sum, a) => sum + toCents(a.availableBalance ?? a.currentBalance ?? '0.00'),
    0,
  );

  // Obligations within the period: confirmed outflow streams whose next
  // expected date falls inside it. next_expected_date is the unpaid marker —
  // recurring matching advances it when the payment posts (M7 hardens this
  // with the transaction-link dedup).
  const obligations: ObligationInput[] = [];
  const outflows = await db
    .select()
    .from(schema.recurringStreams)
    .where(
      and(
        eq(schema.recurringStreams.userId, userId),
        eq(schema.recurringStreams.status, 'confirmed'),
        eq(schema.recurringStreams.direction, 'outflow'),
      ),
    );
  for (const s of outflows) {
    if (!s.nextExpectedDate) continue;
    if (
      compareISO(s.nextExpectedDate, todayISO) >= 0 &&
      compareISO(s.nextExpectedDate, periodEndISO) < 0
    ) {
      obligations.push({
        id: s.id,
        label: s.description,
        amountCents: toCents(s.averageAmount),
        dueDateISO: s.nextExpectedDate,
        kind: 'bill',
      });
    }
  }

  // Debt minimums live in liabilities (never also as streams — see
  // forecastService) so they can't be double-counted.
  const liabilityRows = await db
    .select({ liability: schema.liabilities, account: schema.accounts })
    .from(schema.liabilities)
    .innerJoin(schema.accounts, eq(schema.liabilities.accountId, schema.accounts.id))
    .where(eq(schema.accounts.userId, userId));
  for (const { liability, account } of liabilityRows) {
    if (!liability.minPayment || !liability.nextDueDate) continue;
    if (
      compareISO(liability.nextDueDate, todayISO) >= 0 &&
      compareISO(liability.nextDueDate, periodEndISO) < 0
    ) {
      obligations.push({
        id: `liability:${liability.accountId}`,
        label: `${account.name} payment`,
        amountCents: toCents(liability.minPayment),
        dueDateISO: liability.nextDueDate,
        kind: 'debt_minimum',
      });
    }
  }

  // Goal reserve: this month's scheduled contributions not yet made.
  const activeGoals = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, 'active')));
  let goalReserveCents = 0;
  if (activeGoals.length > 0) {
    const monthStart = firstOfMonth(todayISO);
    const contributions = await db
      .select()
      .from(schema.goalContributions)
      .where(
        and(
          inArray(
            schema.goalContributions.goalId,
            activeGoals.map((g) => g.id),
          ),
          gte(schema.goalContributions.date, monthStart),
        ),
      );
    const contributedByGoal = new Map<string, number>();
    for (const c of contributions) {
      contributedByGoal.set(c.goalId, (contributedByGoal.get(c.goalId) ?? 0) + toCents(c.amount));
    }
    for (const g of activeGoals) {
      const owed = toCents(g.monthlyContribution) - (contributedByGoal.get(g.id) ?? 0);
      goalReserveCents += Math.max(0, owed);
    }
  }

  // Discretionary spending today (posted + pending + planned; credit counts).
  const todayTxns = await db
    .select({ txn: schema.transactions, category: schema.categories })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.date, todayISO)));
  let spentTodayCents = 0;
  for (const { txn, category } of todayTxns) {
    if (txn.excludeFromEngine) continue;
    const cents = toCents(txn.amount);
    if (cents <= 0) continue; // inflows aren't spending
    if (category?.isDiscretionary) spentTodayCents += cents;
  }

  return {
    inputs: {
      todayISO,
      periodEndISO,
      periodSource,
      availableCashCents,
      obligations,
      goalReserveCents,
      emergencyFloorCents: toCents(settings.emergencyFloor),
      spentTodayCents,
      forecastMinBalanceCents: null, // filled by the two-pass clamp below
    },
    availableCashCents,
  };
}

function hashInputs(inputs: EngineInputs): string {
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex').slice(0, 32);
}

export interface SnapshotView {
  forDate: string;
  computedAt: string;
  trigger: string;
  result: EngineResult;
}

/**
 * Compute Safe-to-Spend for the user and persist a snapshot (skipped when
 * inputs are unchanged). Two passes: the first yields the daily allowance,
 * the second re-runs with the forecast minimum (projected at that allowance
 * spend rate over 60 days) so looming dips clamp the number down (PRD §4.1).
 */
export async function computeAndSnapshot(
  userId: string,
  trigger: EngineTrigger,
): Promise<SnapshotView> {
  const settings = await getSettings(userId);
  const todayISO = todayInTimezone(settings.timezone);

  const { inputs } = await buildEngineInputs(userId, todayISO);
  const firstPass = computeSafeToSpend(inputs);

  const forecast = await forecastForUser(userId, {
    todayISO,
    startingBalanceCents: inputs.availableCashCents,
    horizonDays: CLAMP_HORIZON_DAYS,
    dailyDiscretionaryCents: firstPass.dailyAllowanceCents,
  });
  const finalInputs: EngineInputs = {
    ...inputs,
    forecastMinBalanceCents: forecast.minDay.endBalanceCents,
  };
  const result = computeSafeToSpend(finalInputs);
  const inputsHash = hashInputs(finalInputs);

  const [latest] = await db
    .select()
    .from(schema.engineSnapshots)
    .where(and(eq(schema.engineSnapshots.userId, userId), eq(schema.engineSnapshots.forDate, todayISO)))
    .orderBy(desc(schema.engineSnapshots.computedAt))
    .limit(1);

  if (latest && latest.inputsHash === inputsHash) {
    return {
      forDate: latest.forDate,
      computedAt: latest.computedAt.toISOString(),
      trigger: latest.trigger,
      result: latest.lineItems as unknown as EngineResult,
    };
  }

  const [row] = await db
    .insert(schema.engineSnapshots)
    .values({
      userId,
      forDate: todayISO,
      safeToSpend: fromCents(result.safeToSpendTodayCents),
      dailyAllowance: fromCents(result.dailyAllowanceCents),
      discretionaryPool: fromCents(result.discretionaryPoolCents),
      daysLeft: result.daysLeft,
      periodEnd: result.periodEndISO,
      status: result.status,
      // The full EngineResult is the snapshot's line_items payload: it carries
      // the ordered breakdown plus everything needed to re-render it.
      lineItems: result,
      inputsHash,
      trigger,
    })
    .returning();

  return {
    forDate: row!.forDate,
    computedAt: row!.computedAt.toISOString(),
    trigger: row!.trigger,
    result,
  };
}

/** Latest snapshot for the user's current local day, computing if missing. */
export async function getToday(userId: string): Promise<SnapshotView> {
  const settings = await getSettings(userId);
  const todayISO = todayInTimezone(settings.timezone);
  const [latest] = await db
    .select()
    .from(schema.engineSnapshots)
    .where(and(eq(schema.engineSnapshots.userId, userId), eq(schema.engineSnapshots.forDate, todayISO)))
    .orderBy(desc(schema.engineSnapshots.computedAt))
    .limit(1);
  if (latest) {
    return {
      forDate: latest.forDate,
      computedAt: latest.computedAt.toISOString(),
      trigger: latest.trigger,
      result: latest.lineItems as unknown as EngineResult,
    };
  }
  return computeAndSnapshot(userId, 'rollover');
}
