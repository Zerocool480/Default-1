import { and, desc, eq, gte } from 'drizzle-orm';
import { db, schema } from '../../db';
import { formatCents, fromCents, toCents } from '../../shared/money';
import { addDays, compareISO, formatShort, todayInTimezone } from '../../shared/dates';
import type { EngineResult } from '../../shared/engine';
import { getToday } from './engineService';
import { getOrComputeTodayScore } from './scoreService';
import { listGoalsWithEtas } from './goalService';

/**
 * Daily Briefing (PRD §5). Assembled from already-computed artifacts — the
 * briefing does no new math. The recommendation comes from a deterministic
 * rule tree; each leaf carries its own reasons. Stored once per day, exactly
 * as delivered.
 */

interface Recommendation {
  code: string;
  text: string;
  reasons: string[];
}

function recommend(engine: EngineResult, upcomingBills: Array<{ label: string; amountCents: number }>): Recommendation {
  const cashCents = engine.lineItems.find((li) => li.kind === 'cash')?.amountCents ?? 0;
  if (cashCents <= 0 && upcomingBills.length === 0) {
    return {
      code: 'setup',
      text: 'Connect your accounts and confirm your income to get your first real number.',
      reasons: ['The checklist on this screen walks you through it — about five minutes.'],
    };
  }
  if (engine.rawPoolCents <= 0 && engine.recovery) {
    return {
      code: 'recovery',
      text: `Hold off on extra spending — you're ${formatCents(engine.recovery.shortfallCents)} short of what's committed before ${formatShort(engine.periodEndISO)}.`,
      reasons: [
        `Skipping about ${formatCents(engine.recovery.perDayCents)}/day of extras gets you back on track.`,
      ],
    };
  }
  if (engine.clampedByForecastCents > 0) {
    return {
      code: 'guard_dip',
      text: `Spend lightly — ${formatCents(engine.clampedByForecastCents)} is held back to keep you above your emergency floor in the weeks ahead.`,
      reasons: ['A projected dip after your next paycheck is already priced into your number.'],
    };
  }
  if (upcomingBills.length >= 3 || upcomingBills.reduce((s, b) => s + b.amountCents, 0) > engine.discretionaryPoolCents * 2) {
    const names = upcomingBills.slice(0, 3).map((b) => b.label).join(', ');
    return {
      code: 'tight_before_payday',
      text: `Avoid unnecessary spending today — ${names} ${upcomingBills.length > 3 ? 'and more ' : ''}are due before your next paycheck.`,
      reasons: [
        `${formatCents(upcomingBills.reduce((s, b) => s + b.amountCents, 0))} in bills lands before ${formatShort(engine.periodEndISO)}. Your number already covers them — this is about headroom.`,
      ],
    };
  }
  if (engine.status === 'tight') {
    return {
      code: 'lean_period',
      text: `It's a lean stretch — ${formatCents(engine.dailyAllowanceCents)}/day keeps everything on track until ${formatShort(engine.periodEndISO)}.`,
      reasons: ['Bills, goals, and your floor are all covered at that pace.'],
    };
  }
  return {
    code: 'spend_freely',
    text: 'Spend freely within today’s limit.',
    reasons: ['Bills are covered, goals are funded, and your emergency floor is safe.'],
  };
}

export interface BriefingView {
  forDate: string;
  healthScore: number | null;
  healthDelta: number | null;
  safeToSpend: string;
  checkingTotal: string;
  upcomingBillsTotal: string;
  goalsStatus: 'on_track' | 'attention' | 'off_track';
  recommendationCode: string;
  recommendationText: string;
  recommendationReasons: string[];
}

export async function getOrCreateTodayBriefing(userId: string): Promise<BriefingView> {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  const [existing] = await db
    .select()
    .from(schema.briefings)
    .where(and(eq(schema.briefings.userId, userId), eq(schema.briefings.forDate, todayISO)));
  if (existing) {
    return {
      forDate: existing.forDate,
      healthScore: existing.healthScore,
      healthDelta: (existing.recommendationReasons as { healthDelta?: number | null })?.healthDelta ?? null,
      safeToSpend: existing.safeToSpend,
      checkingTotal: existing.checkingTotal,
      upcomingBillsTotal: existing.upcomingBillsTotal,
      goalsStatus: existing.goalsStatus as BriefingView['goalsStatus'],
      recommendationCode: existing.recommendationCode,
      recommendationText: existing.recommendationText,
      recommendationReasons:
        (existing.recommendationReasons as { reasons?: string[] })?.reasons ?? [],
    };
  }

  // Assemble from existing artifacts.
  const snapshot = await getToday(userId);
  const engine = snapshot.result;
  const score = await getOrComputeTodayScore(userId);
  const goals = await listGoalsWithEtas(userId);

  const cashAccounts = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.includeInCashPool, true)));
  const checkingTotalCents = cashAccounts.reduce(
    (s, a) => s + toCents(a.availableBalance ?? a.currentBalance ?? '0.00'),
    0,
  );

  const upcomingBills = engine.lineItems
    .filter((li) => li.kind === 'obligation')
    .map((li) => ({ label: li.label.replace(/ \(due .+\)$/, ''), amountCents: -li.amountCents }));
  const upcomingBillsTotalCents = upcomingBills.reduce((s, b) => s + b.amountCents, 0);

  const active = goals.filter((g) => g.status === 'active');
  const behind = active.filter(
    (g) => g.targetDate && (g.eta.etaISO === null || compareISO(g.eta.etaISO, g.targetDate) > 0),
  );
  const unreachable = active.filter((g) => g.eta.etaISO === null && toCents(g.monthlyContribution) === 0);
  const goalsStatus: BriefingView['goalsStatus'] =
    behind.length > 1 ? 'off_track' : behind.length === 1 || unreachable.length > 0 ? 'attention' : 'on_track';

  const rec = recommend(engine, upcomingBills);

  await db
    .insert(schema.briefings)
    .values({
      userId,
      forDate: todayISO,
      healthScore: score.total,
      safeToSpend: fromCents(engine.safeToSpendTodayCents),
      checkingTotal: fromCents(checkingTotalCents),
      upcomingBillsTotal: fromCents(upcomingBillsTotalCents),
      goalsStatus,
      recommendationCode: rec.code,
      recommendationText: rec.text,
      recommendationReasons: { reasons: rec.reasons, healthDelta: score.deltaFromPrevious },
      deliveredVia: ['in_app'],
    })
    .onConflictDoNothing({ target: [schema.briefings.userId, schema.briefings.forDate] });

  return {
    forDate: todayISO,
    healthScore: score.total,
    healthDelta: score.deltaFromPrevious,
    safeToSpend: fromCents(engine.safeToSpendTodayCents),
    checkingTotal: fromCents(checkingTotalCents),
    upcomingBillsTotal: fromCents(upcomingBillsTotalCents),
    goalsStatus,
    recommendationCode: rec.code,
    recommendationText: rec.text,
    recommendationReasons: rec.reasons,
  };
}

export async function markBriefingRead(userId: string, forDate: string): Promise<void> {
  await db
    .update(schema.briefings)
    .set({ readAt: new Date() })
    .where(and(eq(schema.briefings.userId, userId), eq(schema.briefings.forDate, forDate)));
}

/** History for the score trend line (last N days). */
export async function scoreHistory(userId: string, days = 90) {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');
  return db
    .select({ forDate: schema.scoreSnapshots.forDate, total: schema.scoreSnapshots.total })
    .from(schema.scoreSnapshots)
    .where(and(eq(schema.scoreSnapshots.userId, userId), gte(schema.scoreSnapshots.forDate, addDays(todayISO, -days))))
    .orderBy(schema.scoreSnapshots.forDate);
}
