import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../../db';

/**
 * Tiered categorization (ARCHITECTURE ADR-4). v1 implements tier 1 (learned
 * user rules); tier 2 (Plaid PFC mapping) arrives with sync in M6 and tier 3
 * (AI fallback) in M12 — both slot in behind this same function.
 */
export async function categorizeByRules(
  userId: string,
  txn: { merchantName: string | null; name: string },
): Promise<{ categoryId: string; ruleId: string } | null> {
  const rules = await db
    .select()
    .from(schema.categoryRules)
    .where(eq(schema.categoryRules.userId, userId))
    .orderBy(schema.categoryRules.priority, schema.categoryRules.createdAt);

  const haystack = (txn.merchantName ?? txn.name).toLowerCase().trim();
  for (const rule of rules) {
    const needle = rule.matcherValue.toLowerCase().trim();
    const hit =
      rule.matcherType === 'merchant_exact'
        ? haystack === needle
        : rule.matcherType === 'merchant_contains'
          ? haystack.includes(needle)
          : false;
    if (hit) {
      await db
        .update(schema.categoryRules)
        .set({ hitCount: sql`${schema.categoryRules.hitCount} + 1` })
        .where(eq(schema.categoryRules.id, rule.id));
      return { categoryId: rule.categoryId, ruleId: rule.id };
    }
  }
  return null;
}

/** Create a rule from a user correction and apply it to matching history. */
export async function createRuleFromCorrection(
  userId: string,
  opts: { merchant: string; categoryId: string; fromTransactionId: string },
): Promise<{ ruleId: string; retroactivelyApplied: number }> {
  const [rule] = await db
    .insert(schema.categoryRules)
    .values({
      userId,
      matcherType: 'merchant_exact',
      matcherValue: opts.merchant.toLowerCase().trim(),
      categoryId: opts.categoryId,
      priority: 10, // user corrections outrank everything
      createdFromTransactionId: opts.fromTransactionId,
    })
    .returning();

  // Retroactively fix history that matches and wasn't hand-set by the user.
  const updated = await db
    .update(schema.transactions)
    .set({ categoryId: opts.categoryId, categorySource: 'rule', updatedAt: new Date() })
    .where(
      and(
        eq(schema.transactions.userId, userId),
        sql`lower(coalesce(${schema.transactions.merchantName}, ${schema.transactions.name})) = ${opts.merchant.toLowerCase().trim()}`,
        sql`${schema.transactions.categorySource} <> 'user'`,
      ),
    )
    .returning({ id: schema.transactions.id });

  return { ruleId: rule!.id, retroactivelyApplied: updated.length };
}
