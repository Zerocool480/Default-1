import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '../../db';
import { toCents } from '../../shared/money';
import { addDays, compareISO, todayInTimezone } from '../../shared/dates';
import { computeHealthScore, type HealthScore, type ScoreInputs } from '../../intelligence/score/compute';
import { buildEngineInputs } from './engineService';
import { forecastForUser } from './forecastService';
import { computeSafeToSpend } from '../../intelligence/engine/compute';
import { computeGoalEta } from '../../intelligence/goals/eta';

async function gatherScoreInputs(userId: string, todayISO: string): Promise<ScoreInputs> {
  const from90 = addDays(todayISO, -90);

  // Cash flow: inflows/outflows over 90 days (excluding transfers/exclusions).
  const flows = await db
    .select({
      inflow: sql<string>`coalesce(sum(case when ${schema.transactions.amount} < 0 then -${schema.transactions.amount} else 0 end), 0)`,
      outflow: sql<string>`coalesce(sum(case when ${schema.transactions.amount} > 0 then ${schema.transactions.amount} else 0 end), 0)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(
      and(
        eq(schema.transactions.userId, userId),
        gte(schema.transactions.date, from90),
        eq(schema.transactions.excludeFromEngine, false),
        sql`coalesce(${schema.categories.kind}, 'spending') <> 'transfer'`,
      ),
    );
  const inflow90Cents = toCents(flows[0]!.inflow);
  const outflow90Cents = toCents(flows[0]!.outflow);

  // Emergency fund: the goal named for it (fallback: savings-linked goals).
  const goals = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, 'active')));
  const emergency = goals.find((g) => /emergency/i.test(g.name));
  const emergencyFundedCents = emergency ? toCents(emergency.fundedAmount) : 0;

  // Essentials: confirmed essential outflow streams, normalized to monthly.
  const streams = await db
    .select()
    .from(schema.recurringStreams)
    .where(
      and(
        eq(schema.recurringStreams.userId, userId),
        eq(schema.recurringStreams.status, 'confirmed'),
        eq(schema.recurringStreams.direction, 'outflow'),
        eq(schema.recurringStreams.isEssential, true),
      ),
    );
  const PER_MONTH: Record<string, number> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    semi_monthly: 2,
    monthly: 1,
    annual: 1 / 12,
    irregular: 0,
  };
  const monthlyEssentialsCents = Math.round(
    streams.reduce((s, st) => s + toCents(st.averageAmount) * (PER_MONTH[st.frequency] ?? 0), 0),
  );

  // Debt: utilization across credit accounts.
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  const cards = accounts.filter((a) => a.type === 'credit' && a.creditLimit);
  const creditUsedCents =
    cards.length > 0 ? cards.reduce((s, a) => s + toCents(a.currentBalance ?? '0.00'), 0) : null;
  const creditLimitCents =
    cards.length > 0 ? cards.reduce((s, a) => s + toCents(a.creditLimit!), 0) : null;

  // Bills: engine pool + forecast floor from the same sources the number uses.
  const { inputs } = await buildEngineInputs(userId, todayISO);
  const engine = computeSafeToSpend(inputs);
  const forecast = await forecastForUser(userId, {
    todayISO,
    startingBalanceCents: inputs.availableCashCents,
    horizonDays: 60,
    dailyDiscretionaryCents: engine.dailyAllowanceCents,
  });

  // Discipline: last 30 days of snapshots — final snapshot per day, spent ≤ allowance.
  const snaps = await db
    .select()
    .from(schema.engineSnapshots)
    .where(and(eq(schema.engineSnapshots.userId, userId), gte(schema.engineSnapshots.forDate, addDays(todayISO, -30))))
    .orderBy(desc(schema.engineSnapshots.computedAt));
  const lastPerDay = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!lastPerDay.has(s.forDate)) lastPerDay.set(s.forDate, s);
  lastPerDay.delete(todayISO); // today isn't over yet
  let within = 0;
  for (const s of lastPerDay.values()) {
    const result = s.lineItems as { spentTodayCents?: number; dailyAllowanceCents?: number };
    if ((result.spentTodayCents ?? 0) <= (result.dailyAllowanceCents ?? 0)) within++;
  }
  const disciplineRatio = lastPerDay.size >= 7 ? within / lastPerDay.size : null;

  // Savings rate: goal contributions over 90d vs income.
  const contribRows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.goalContributions.amount}), 0)` })
    .from(schema.goalContributions)
    .innerJoin(schema.goals, eq(schema.goalContributions.goalId, schema.goals.id))
    .where(and(eq(schema.goals.userId, userId), gte(schema.goalContributions.date, from90)));
  const savingsRate =
    inflow90Cents > 0 ? toCents(contribRows[0]!.total) / inflow90Cents : null;

  // Goal pace: ETA within target date (goals without targets count as on pace
  // when they have any ETA at all).
  let goalsOnPace = 0;
  for (const g of goals) {
    const eta = computeGoalEta({
      todayISO,
      fundedCents: toCents(g.fundedAmount),
      targetCents: toCents(g.targetAmount),
      monthlyContributionCents: toCents(g.monthlyContribution),
    });
    if (eta.etaISO !== null && (!g.targetDate || compareISO(eta.etaISO, g.targetDate) <= 0)) {
      goalsOnPace++;
    }
  }

  // Net-worth trend needs balance history (arrives with sync history); null
  // scores neutral with its own reason until there are ≥ 2 datapoints.
  return {
    inflow90Cents,
    outflow90Cents,
    emergencyFundedCents,
    monthlyEssentialsCents,
    creditUsedCents,
    creditLimitCents,
    billsCoveredNow: engine.rawPoolCents + engine.clampedByForecastCents >= 0,
    forecastStaysPositive: forecast.minDay.endBalanceCents >= 0,
    disciplineRatio,
    savingsRate,
    goalsOnPace,
    goalsTotal: goals.length,
    netWorthChangePct: null,
  };
}

export interface ScoreView {
  forDate: string;
  total: number;
  pillars: HealthScore['pillars'];
  deltaFromPrevious: number | null;
  deltaReasons: string[];
}

/** Compute today's score, persist one snapshot per day, attribute the delta. */
export async function getOrComputeTodayScore(userId: string): Promise<ScoreView> {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  const [existing] = await db
    .select()
    .from(schema.scoreSnapshots)
    .where(and(eq(schema.scoreSnapshots.userId, userId), eq(schema.scoreSnapshots.forDate, todayISO)))
    .orderBy(desc(schema.scoreSnapshots.computedAt))
    .limit(1);
  if (existing) {
    const payload = existing.subScores as HealthScore;
    return {
      forDate: existing.forDate,
      total: existing.total,
      pillars: payload.pillars,
      deltaFromPrevious: (existing.deltaReasons as { delta?: number } | null)?.delta ?? null,
      deltaReasons: ((existing.deltaReasons as { reasons?: string[] } | null)?.reasons ?? []),
    };
  }

  const inputs = await gatherScoreInputs(userId, todayISO);
  const score = computeHealthScore(inputs);

  const [previous] = await db
    .select()
    .from(schema.scoreSnapshots)
    .where(eq(schema.scoreSnapshots.userId, userId))
    .orderBy(desc(schema.scoreSnapshots.forDate))
    .limit(1);

  let delta: number | null = null;
  const deltaReasons: string[] = [];
  if (previous) {
    delta = score.total - previous.total;
    const prevPillars = (previous.subScores as HealthScore).pillars;
    for (const p of score.pillars) {
      const before = prevPillars.find((q) => q.key === p.key);
      if (before && before.score !== p.score) {
        deltaReasons.push(
          `${p.label}: ${before.score} → ${p.score}. ${p.reasons[0] ?? ''}`.trim(),
        );
      }
    }
  }

  await db.insert(schema.scoreSnapshots).values({
    userId,
    forDate: todayISO,
    total: score.total,
    subScores: score,
    deltaReasons: { delta, reasons: deltaReasons },
  });

  return { forDate: todayISO, total: score.total, pillars: score.pillars, deltaFromPrevious: delta, deltaReasons };
}
