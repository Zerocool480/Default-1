import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../../db';
import { formatCents, toCents } from '../../shared/money';
import { addDays, diffDays, firstOfMonth, firstOfNextMonth, todayInTimezone } from '../../shared/dates';

/**
 * Coach insights (PRD G4): deterministic, evidence-based, forward-looking,
 * dismissible. Candidates are computed on demand; a stable dedupe key stored
 * in `data.key` ensures a dismissed insight stays dismissed and nothing
 * repeats. AI phrasing can rewrap these later (M12); the facts live here.
 */

interface Candidate {
  key: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warn';
  expiresAt: Date;
}

const DAY_MS = 86_400_000;

async function budgetPaceCandidates(userId: string, todayISO: string): Promise<Candidate[]> {
  const monthStart = firstOfMonth(todayISO);
  const daysInMonth = diffDays(monthStart, firstOfNextMonth(todayISO));
  const monthPct = ((diffDays(monthStart, todayISO) + 1) / daysInMonth) * 100;
  const daysLeft = daysInMonth - diffDays(monthStart, todayISO) - 1;

  const budgets = await db
    .select({ budget: schema.budgets, category: schema.categories })
    .from(schema.budgets)
    .innerJoin(schema.categories, eq(schema.budgets.categoryId, schema.categories.id))
    .where(eq(schema.budgets.userId, userId));
  if (budgets.length === 0) return [];

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
        inArray(
          schema.transactions.categoryId,
          budgets.map((b) => b.budget.categoryId),
        ),
      ),
    )
    .groupBy(schema.transactions.categoryId);
  const byCat = new Map(spent.map((r) => [r.categoryId, toCents(r.total)]));

  const out: Candidate[] = [];
  for (const { budget, category } of budgets) {
    const limit = toCents(budget.monthlyLimit);
    if (limit <= 0) continue;
    const used = byCat.get(category.id) ?? 0;
    const usedPct = (used / limit) * 100;
    // Hot pace: meaningfully ahead of the calendar with real month left.
    if (usedPct >= 70 && usedPct < 100 && usedPct > monthPct + 15 && daysLeft >= 5) {
      const left = limit - used;
      out.push({
        key: `budget_pace:${category.id}:${monthStart}`,
        type: 'budget_pace',
        title: `${category.name} at ${Math.round(usedPct)}% with ${daysLeft} days left`,
        body: `${formatCents(Math.floor(left / daysLeft))}/day keeps you under for the month.`,
        severity: 'info',
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      });
    }
  }
  return out;
}

async function priceIncreaseCandidates(userId: string): Promise<Candidate[]> {
  const streams = await db
    .select()
    .from(schema.recurringStreams)
    .where(
      and(
        eq(schema.recurringStreams.userId, userId),
        eq(schema.recurringStreams.direction, 'outflow'),
        sql`${schema.recurringStreams.status} in ('detected', 'confirmed')`,
      ),
    );
  const out: Candidate[] = [];
  for (const s of streams) {
    if (!s.lastAmount) continue;
    const last = toCents(s.lastAmount);
    const avg = toCents(s.averageAmount);
    if (avg > 0 && last >= avg * 1.07 && last - avg >= 1_00) {
      out.push({
        key: `price_increase:${s.id}:${s.lastAmount}`,
        type: 'price_increase',
        title: `${s.description} went up`,
        body: `Last charge was ${formatCents(last)}, up from a typical ${formatCents(avg)}. Worth a look on the Recurring tab.`,
        severity: 'warn',
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
      });
    }
  }
  return out;
}

async function duplicateChargeCandidates(userId: string, todayISO: string): Promise<Candidate[]> {
  const recent = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.userId, userId),
        gte(schema.transactions.date, addDays(todayISO, -3)),
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.excludeFromEngine, false),
      ),
    );
  const seen = new Map<string, typeof recent>();
  for (const t of recent) {
    const merchant = (t.merchantName ?? t.name).toLowerCase();
    const k = `${merchant}|${t.amount}`;
    const list = seen.get(k) ?? [];
    list.push(t);
    seen.set(k, list);
  }
  const out: Candidate[] = [];
  for (const [, list] of seen) {
    if (list.length < 2) continue;
    // Same merchant + same amount on different rows within 3 days.
    const t = list[0]!;
    out.push({
      key: `duplicate_charge:${(t.merchantName ?? t.name).toLowerCase()}:${t.amount}:${t.date}`,
      type: 'duplicate_charge',
      title: `Possible duplicate: ${t.merchantName ?? t.name}`,
      body: `${list.length} charges of ${formatCents(toCents(t.amount))} within a few days. If one's a mistake, dispute it and exclude it from the engine.`,
      severity: 'warn',
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    });
  }
  return out;
}

export interface InsightView {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: string;
}

/** Refresh candidates (respecting dismissals) and return active insights, capped. */
export async function getActiveInsights(userId: string, cap = 2): Promise<InsightView[]> {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const todayISO = todayInTimezone(settings?.timezone ?? 'America/New_York');

  const candidates = [
    ...(await budgetPaceCandidates(userId, todayISO)),
    ...(await priceIncreaseCandidates(userId)),
    ...(await duplicateChargeCandidates(userId, todayISO)),
  ];

  const existing = await db
    .select()
    .from(schema.insights)
    .where(eq(schema.insights.userId, userId));
  const byKey = new Map(existing.map((i) => [(i.data as { key?: string } | null)?.key, i]));

  for (const c of candidates) {
    if (byKey.has(c.key)) continue; // already surfaced (active or dismissed)
    await db.insert(schema.insights).values({
      userId,
      type: c.type,
      title: c.title,
      body: c.body,
      severity: c.severity,
      data: { key: c.key },
      expiresAt: c.expiresAt,
    });
  }

  const now = new Date();
  const active = (
    await db
      .select()
      .from(schema.insights)
      .where(and(eq(schema.insights.userId, userId), eq(schema.insights.status, 'active')))
      .orderBy(schema.insights.createdAt)
  ).filter((i) => !i.expiresAt || i.expiresAt > now);

  return active.slice(0, cap).map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    body: i.body,
    severity: i.severity,
  }));
}

export async function dismissInsight(userId: string, insightId: string): Promise<boolean> {
  const updated = await db
    .update(schema.insights)
    .set({ status: 'dismissed' })
    .where(and(eq(schema.insights.id, insightId), eq(schema.insights.userId, userId)))
    .returning({ id: schema.insights.id });
  return updated.length > 0;
}
