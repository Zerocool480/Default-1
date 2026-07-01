import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { toCents } from '../../shared/money';
import { todayInTimezone } from '../../shared/dates';
import { computeGoalEta, type GoalEta } from '../../intelligence/goals/eta';

export interface GoalWithEta {
  id: string;
  name: string;
  targetAmount: string;
  fundedAmount: string;
  monthlyContribution: string;
  targetDate: string | null;
  status: string;
  priority: number;
  eta: GoalEta;
}

export async function listGoalsWithEtas(
  userId: string,
  opts: { recordHistory?: boolean; trigger?: string } = {},
): Promise<GoalWithEta[]> {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  const rows = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId)))
    .orderBy(schema.goals.priority, schema.goals.createdAt);

  const out: GoalWithEta[] = [];
  for (const g of rows) {
    const eta = computeGoalEta({
      todayISO,
      fundedCents: toCents(g.fundedAmount),
      targetCents: toCents(g.targetAmount),
      monthlyContributionCents: toCents(g.monthlyContribution),
    });

    if (opts.recordHistory && g.status === 'active') {
      const [last] = await db
        .select()
        .from(schema.goalEtaHistory)
        .where(eq(schema.goalEtaHistory.goalId, g.id))
        .orderBy(desc(schema.goalEtaHistory.computedAt))
        .limit(1);
      if (!last || last.etaDate !== eta.etaISO) {
        await db.insert(schema.goalEtaHistory).values({
          goalId: g.id,
          etaDate: eta.etaISO,
          percentComplete: eta.percentComplete.toFixed(2),
          trigger: opts.trigger ?? 'manual',
        });
      }
    }

    out.push({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      fundedAmount: g.fundedAmount,
      monthlyContribution: g.monthlyContribution,
      targetDate: g.targetDate,
      status: g.status,
      priority: g.priority,
      eta,
    });
  }
  return out;
}
