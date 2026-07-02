/**
 * Copilot tools — thin, read-only wrappers over the intelligence layer
 * (ARCHITECTURE ADR-6: the model orchestrates and explains; the math lives
 * in deterministic code). Amounts are returned as dollar strings so the
 * model never does unit conversion.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '../../db';
import { fromCents, toCents } from '../../shared/money';
import { addDays, todayInTimezone } from '../../shared/dates';
import { getToday, buildEngineInputs } from '../services/engineService';
import { buildForecastEvents } from '../services/forecastService';
import { getOrComputeTodayScore } from '../services/scoreService';
import { listGoalsWithEtas } from '../services/goalService';
import { computeSafeToSpend } from '../../intelligence/engine/compute';
import { projectCashFlow } from '../../intelligence/forecast/project';
import { evaluatePurchase } from '../../intelligence/scenario/purchase';

const $ = (cents: number) => fromCents(cents);

async function userToday(userId: string): Promise<string> {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  return todayInTimezone(settings?.timezone ?? 'America/New_York');
}

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'get_safe_to_spend',
    description:
      "Get today's Safe-to-Spend snapshot: the number, daily allowance, discretionary pool, days until payday, status, and the exact line-item breakdown (cash, each bill, goal reserve, emergency floor). Call this for any question about today's number or what the user can spend.",
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_forecast',
    description:
      'Project cash flow forward: upcoming money events (paychecks, bills, debt payments) and the projected balance after each, plus the lowest point. Call for questions about upcoming bills, whether money will be tight later, or timing decisions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        horizonDays: {
          type: 'integer',
          enum: [7, 30, 60, 90],
          description: 'How far ahead to project. Default 30.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_health_score',
    description:
      'Get the Financial Health Score (0-100) with all 8 pillar scores, their weights, and the reasons behind each. Call for "how am I doing", debt, savings-rate, or emergency-fund questions.',
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_goals',
    description:
      'List savings goals with funded/target amounts, monthly contributions, percent complete, and estimated arrival dates. Call for any goal-related question.',
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_budgets',
    description:
      'List category budgets with month-to-date spending and how much of the month has elapsed. Call for budget-pace questions ("how am I doing on restaurants?").',
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_recurring',
    description:
      'List confirmed recurring bills, subscriptions, and income streams with amounts, frequency, and next expected dates. Also flags recent price increases. Call for subscription or bill questions.',
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'get_spending_summary',
    description:
      'Aggregate spending over a trailing window: totals by category and top merchants. Call for "where is my money going" or trend questions. Returns aggregates, not raw transactions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'integer', enum: [7, 30, 90], description: 'Trailing window. Default 30.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'run_purchase_scenario',
    description:
      'Simulate a hypothetical purchase against the real engine and forecast: verdict (yes/tight/not_now), risk level, and quantified impacts (bills coverage, emergency floor, new daily allowance). ALWAYS call this for any "can I afford X" question instead of doing the math yourself. Never writes data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'string', description: 'Purchase price as a decimal string, e.g. "449.00"' },
        label: { type: 'string', description: 'What the purchase is' },
      },
      required: ['amount'],
      additionalProperties: false,
    },
  },
];

type ToolInput = Record<string, unknown>;

export async function executeTool(
  userId: string,
  name: string,
  input: ToolInput,
): Promise<unknown> {
  switch (name) {
    case 'get_safe_to_spend': {
      const snap = await getToday(userId);
      const r = snap.result;
      return {
        forDate: snap.forDate,
        safeToSpendToday: $(r.safeToSpendTodayCents),
        dailyAllowance: $(r.dailyAllowanceCents),
        discretionaryPool: $(r.discretionaryPoolCents),
        spentToday: $(r.spentTodayCents),
        daysUntilPayday: r.daysLeft,
        periodEnd: r.periodEndISO,
        status: r.status,
        heldBackForForecastDip: $(r.clampedByForecastCents),
        recovery: r.recovery
          ? { shortfall: $(r.recovery.shortfallCents), perDay: $(r.recovery.perDayCents) }
          : null,
        breakdown: r.lineItems.map((li) => ({ label: li.label, amount: $(li.amountCents) })),
      };
    }

    case 'get_forecast': {
      const horizonDays = Number(input.horizonDays ?? 30);
      const todayISO = await userToday(userId);
      const { inputs } = await buildEngineInputs(userId, todayISO);
      const allowance = computeSafeToSpend(inputs).dailyAllowanceCents;
      const startISO = addDays(todayISO, 1);
      const events = await buildForecastEvents(userId, startISO, addDays(startISO, horizonDays));
      const forecast = projectCashFlow({
        startISO,
        horizonDays,
        startingBalanceCents: inputs.availableCashCents,
        events,
        dailyDiscretionaryCents: allowance,
      });
      return {
        assumesDailySpendingOf: $(allowance),
        startingCash: $(inputs.availableCashCents),
        lowestPoint: { date: forecast.minDay.dateISO, balance: $(forecast.minDay.endBalanceCents) },
        endBalance: $(forecast.endBalanceCents),
        events: forecast.days
          .filter((d) => d.events.length > 0)
          .map((d) => ({
            date: d.dateISO,
            events: d.events.map((e) => ({ label: e.label, amount: $(e.amountCents), type: e.type })),
            balanceAfter: $(d.endBalanceCents),
          })),
      };
    }

    case 'get_health_score': {
      const score = await getOrComputeTodayScore(userId);
      return {
        total: score.total,
        changeSincePrevious: score.deltaFromPrevious,
        changeReasons: score.deltaReasons,
        pillars: score.pillars.map((p) => ({
          name: p.label,
          score: p.score,
          weightPct: Math.round(p.weight * 100),
          reasons: p.reasons,
        })),
      };
    }

    case 'get_goals': {
      const goals = await listGoalsWithEtas(userId);
      return goals.map((g) => ({
        name: g.name,
        funded: g.fundedAmount,
        target: g.targetAmount,
        monthlyContribution: g.monthlyContribution,
        percentComplete: g.eta.percentComplete,
        estimatedArrival: g.eta.etaISO,
        targetDate: g.targetDate,
        status: g.status,
      }));
    }

    case 'get_budgets': {
      const todayISO = await userToday(userId);
      const monthStart = `${todayISO.slice(0, 7)}-01`;
      const budgets = await db
        .select({ budget: schema.budgets, category: schema.categories })
        .from(schema.budgets)
        .innerJoin(schema.categories, eq(schema.budgets.categoryId, schema.categories.id))
        .where(eq(schema.budgets.userId, userId));
      const spent = await db
        .select({
          categoryId: schema.transactions.categoryId,
          total: sql<string>`coalesce(sum(${schema.transactions.amount}), 0)`,
        })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.userId, userId),
            gte(schema.transactions.date, monthStart),
            eq(schema.transactions.excludeFromEngine, false),
            sql`${schema.transactions.amount} > 0`,
          ),
        )
        .groupBy(schema.transactions.categoryId);
      const byCat = new Map(spent.map((r) => [r.categoryId, r.total]));
      const dayOfMonth = Number(todayISO.slice(8, 10));
      return {
        dayOfMonth,
        budgets: budgets.map(({ budget, category }) => ({
          category: category.name,
          monthlyLimit: budget.monthlyLimit,
          spentThisMonth: byCat.get(category.id) ?? '0.00',
        })),
      };
    }

    case 'get_recurring': {
      const streams = await db
        .select()
        .from(schema.recurringStreams)
        .where(
          and(
            eq(schema.recurringStreams.userId, userId),
            eq(schema.recurringStreams.status, 'confirmed'),
          ),
        )
        .orderBy(schema.recurringStreams.nextExpectedDate);
      return streams.map((s) => ({
        description: s.description,
        direction: s.direction,
        amount: s.averageAmount,
        lastCharged: s.lastAmount,
        priceIncreased:
          s.lastAmount !== null && toCents(s.lastAmount) >= toCents(s.averageAmount) * 1.07,
        frequency: s.frequency,
        nextExpected: s.nextExpectedDate,
        essential: s.isEssential,
      }));
    }

    case 'get_spending_summary': {
      const days = Number(input.days ?? 30);
      const todayISO = await userToday(userId);
      const from = addDays(todayISO, -days);
      const byCategory = await db
        .select({
          category: sql<string>`coalesce(${schema.categories.name}, 'Uncategorized')`,
          total: sql<string>`sum(${schema.transactions.amount})`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.transactions)
        .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
        .where(
          and(
            eq(schema.transactions.userId, userId),
            gte(schema.transactions.date, from),
            eq(schema.transactions.excludeFromEngine, false),
            sql`${schema.transactions.amount} > 0`,
          ),
        )
        .groupBy(sql`coalesce(${schema.categories.name}, 'Uncategorized')`)
        .orderBy(desc(sql`sum(${schema.transactions.amount})`));
      const topMerchants = await db
        .select({
          merchant: sql<string>`coalesce(${schema.transactions.merchantName}, ${schema.transactions.name})`,
          total: sql<string>`sum(${schema.transactions.amount})`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.userId, userId),
            gte(schema.transactions.date, from),
            eq(schema.transactions.excludeFromEngine, false),
            sql`${schema.transactions.amount} > 0`,
          ),
        )
        .groupBy(sql`coalesce(${schema.transactions.merchantName}, ${schema.transactions.name})`)
        .orderBy(desc(sql`sum(${schema.transactions.amount})`))
        .limit(10);
      return { windowDays: days, byCategory, topMerchants };
    }

    case 'run_purchase_scenario': {
      const amount = String(input.amount ?? '');
      if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
        return { error: 'amount must be a decimal string like "449.00"' };
      }
      const todayISO = await userToday(userId);
      const { inputs } = await buildEngineInputs(userId, todayISO);
      const allowance = computeSafeToSpend(inputs).dailyAllowanceCents;
      const startISO = addDays(todayISO, 1);
      const events = await buildForecastEvents(userId, startISO, addDays(startISO, 60));
      const evaluation = evaluatePurchase(
        inputs,
        {
          startISO,
          horizonDays: 60,
          startingBalanceCents: inputs.availableCashCents,
          events,
          dailyDiscretionaryCents: allowance,
        },
        {
          amountCents: toCents(amount),
          label: typeof input.label === 'string' ? input.label : undefined,
        },
      );
      return {
        verdict: evaluation.verdict,
        risk: evaluation.risk,
        headline: evaluation.headline,
        impacts: evaluation.impacts.map((i) => i.text),
        dailyAllowanceBefore: $(evaluation.before.dailyAllowanceCents),
        dailyAllowanceAfter: $(evaluation.after.dailyAllowanceCents),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
