import { and, eq } from 'drizzle-orm';
import type { Transaction as PlaidTransaction } from 'plaid';
import { db, schema } from '../../db';
import {
  getAccounts,
  getLiabilities,
  getRecurringStreams,
  syncTransactionsPage,
} from '../providers/plaid';
import { categorizeByRules } from './categorize';
import { ensureDefaultCategories, mapPfcToCategoryName } from './taxonomy';
import { computeAndSnapshot } from './engineService';
import { listGoalsWithEtas } from './goalService';
import { aiEnabled } from '../ai/copilot';
import { categorizeWithAI } from '../ai/categorizer';

type Item = typeof schema.plaidItems.$inferSelect;

/** Map a Plaid account to our cash-pool default: checking spends, rest don't. */
function defaultCashPool(type: string, subtype: string | null): boolean {
  return type === 'depository' && subtype === 'checking';
}

async function upsertAccounts(item: Item): Promise<Map<string, string>> {
  const accounts = await getAccounts(item.accessTokenEnc!);
  const idByPlaidId = new Map<string, string>();
  for (const a of accounts) {
    const [existing] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.plaidAccountId, a.account_id));
    const balances = {
      currentBalance: a.balances.current?.toFixed(2) ?? null,
      availableBalance: a.balances.available?.toFixed(2) ?? a.balances.current?.toFixed(2) ?? null,
      creditLimit: a.balances.limit?.toFixed(2) ?? null,
      balancesUpdatedAt: new Date(),
    };
    if (existing) {
      await db.update(schema.accounts).set(balances).where(eq(schema.accounts.id, existing.id));
      idByPlaidId.set(a.account_id, existing.id);
    } else {
      const [row] = await db
        .insert(schema.accounts)
        .values({
          userId: item.userId,
          itemId: item.id,
          plaidAccountId: a.account_id,
          name: a.name,
          officialName: a.official_name ?? null,
          type: a.type,
          subtype: a.subtype ?? null,
          mask: a.mask ?? null,
          includeInCashPool: defaultCashPool(a.type, a.subtype ?? null),
          ...balances,
        })
        .returning();
      idByPlaidId.set(a.account_id, row!.id);
    }
  }
  return idByPlaidId;
}

async function categorize(
  userId: string,
  t: PlaidTransaction,
  categoriesByName: Map<string, string>,
): Promise<{ categoryId: string | null; source: string }> {
  // Tier 1: learned user rules always win.
  const ruled = await categorizeByRules(userId, {
    merchantName: t.merchant_name ?? null,
    name: t.name,
  });
  if (ruled) return { categoryId: ruled.categoryId, source: 'rule' };
  // Tier 2: Plaid's own categorization mapped onto our taxonomy.
  const name = mapPfcToCategoryName(
    t.personal_finance_category?.primary,
    t.personal_finance_category?.detailed,
  );
  if (name && categoriesByName.has(name)) {
    return { categoryId: categoriesByName.get(name)!, source: 'plaid' };
  }
  // Tier 3 (AI) arrives in M12; until then → review queue.
  return { categoryId: null, source: 'none' };
}

function txnValues(
  item: Item,
  t: PlaidTransaction,
  accountId: string,
  cat: { categoryId: string | null; source: string },
) {
  return {
    userId: item.userId,
    accountId,
    plaidTransactionId: t.transaction_id,
    pendingPlaidId: t.pending_transaction_id ?? null,
    amount: t.amount.toFixed(2), // Plaid sign: + outflow
    date: t.date,
    authorizedDate: t.authorized_date ?? null,
    merchantName: t.merchant_name ?? null,
    name: t.name,
    categoryId: cat.categoryId,
    categorySource: cat.source,
    plaidPfcPrimary: t.personal_finance_category?.primary ?? null,
    plaidPfcDetailed: t.personal_finance_category?.detailed ?? null,
    isPending: t.pending,
    source: 'plaid' as const,
    raw: t as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
}

async function syncTransactions(item: Item, accountIds: Map<string, string>): Promise<number> {
  const categoriesByName = await ensureDefaultCategories(item.userId);
  let cursor = item.syncCursor;
  let touched = 0;

  for (let page = 0; page < 40; page++) {
    const res = await syncTransactionsPage(item.accessTokenEnc!, cursor);

    for (const t of res.added) {
      const accountId = accountIds.get(t.account_id);
      if (!accountId) continue;
      touched++;
      // A posted transaction that replaces a pending one updates that row in
      // place, so user corrections made while it was pending survive.
      if (t.pending_transaction_id) {
        const [pendingRow] = await db
          .select()
          .from(schema.transactions)
          .where(eq(schema.transactions.plaidTransactionId, t.pending_transaction_id));
        if (pendingRow) {
          const keepUserCategory = pendingRow.categorySource === 'user';
          const cat = keepUserCategory
            ? { categoryId: pendingRow.categoryId, source: 'user' }
            : await categorize(item.userId, t, categoriesByName);
          await db
            .update(schema.transactions)
            .set(txnValues(item, t, accountId, cat))
            .where(eq(schema.transactions.id, pendingRow.id));
          continue;
        }
      }
      const cat = await categorize(item.userId, t, categoriesByName);
      await db
        .insert(schema.transactions)
        .values(txnValues(item, t, accountId, cat))
        .onConflictDoNothing({ target: schema.transactions.plaidTransactionId });
    }

    for (const t of res.modified) {
      const accountId = accountIds.get(t.account_id);
      if (!accountId) continue;
      const [existing] = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.plaidTransactionId, t.transaction_id));
      if (!existing) continue;
      touched++;
      const cat =
        existing.categorySource === 'user'
          ? { categoryId: existing.categoryId, source: 'user' }
          : await categorize(item.userId, t, categoriesByName);
      await db
        .update(schema.transactions)
        .set(txnValues(item, t, accountId, cat))
        .where(eq(schema.transactions.id, existing.id));
    }

    for (const r of res.removed) {
      touched++;
      await db
        .delete(schema.transactions)
        .where(eq(schema.transactions.plaidTransactionId, r.transaction_id));
    }

    cursor = res.nextCursor;
    if (!res.hasMore) break;
  }

  await db
    .update(schema.plaidItems)
    .set({ syncCursor: cursor, lastSyncedAt: new Date(), status: 'active' })
    .where(eq(schema.plaidItems.id, item.id));
  return touched;
}

async function syncLiabilities(item: Item, accountIds: Map<string, string>): Promise<void> {
  for (const l of await getLiabilities(item.accessTokenEnc!)) {
    const accountId = accountIds.get(l.plaidAccountId);
    if (!accountId) continue;
    await db
      .insert(schema.liabilities)
      .values({
        accountId,
        minPayment: l.minPayment,
        nextDueDate: l.nextDueDate,
        lastStatementBalance: l.lastStatementBalance,
        apr: l.apr,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.liabilities.accountId,
        set: {
          minPayment: l.minPayment,
          nextDueDate: l.nextDueDate,
          lastStatementBalance: l.lastStatementBalance,
          apr: l.apr,
          updatedAt: new Date(),
        },
      });
  }
}

const PLAID_FREQUENCY: Record<string, string> = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  SEMI_MONTHLY: 'semi_monthly',
  MONTHLY: 'monthly',
  ANNUALLY: 'annual',
  UNKNOWN: 'irregular',
};

async function syncRecurring(item: Item, accountIds: Map<string, string>): Promise<void> {
  const { inflow, outflow } = await getRecurringStreams(item.accessTokenEnc!);
  const both = [
    ...inflow.map((s) => ({ s, direction: 'inflow' as const })),
    ...outflow.map((s) => ({ s, direction: 'outflow' as const })),
  ];
  for (const { s, direction } of both) {
    if (s.is_active === false) continue;
    const [existing] = await db
      .select()
      .from(schema.recurringStreams)
      .where(
        and(
          eq(schema.recurringStreams.userId, item.userId),
          eq(schema.recurringStreams.plaidStreamId, s.stream_id),
        ),
      );
    const values = {
      accountId: accountIds.get(s.account_id) ?? null,
      direction,
      merchantName: s.merchant_name ?? null,
      description: s.merchant_name ?? s.description ?? 'Recurring',
      frequency: PLAID_FREQUENCY[s.frequency] ?? 'irregular',
      // Plaid follows its transaction sign convention (inflows negative);
      // we store magnitudes with an explicit direction.
      averageAmount: Math.abs(s.average_amount?.amount ?? 0).toFixed(2),
      lastAmount: s.last_amount?.amount != null ? Math.abs(s.last_amount.amount).toFixed(2) : null,
      nextExpectedDate: s.predicted_next_date ?? null,
      updatedAt: new Date(),
    };
    if (existing) {
      // Never overwrite a user decision (confirmed/dismissed stays put).
      await db
        .update(schema.recurringStreams)
        .set(values)
        .where(eq(schema.recurringStreams.id, existing.id));
    } else {
      await db.insert(schema.recurringStreams).values({
        userId: item.userId,
        plaidStreamId: s.stream_id,
        status: 'detected',
        ...values,
      });
    }
  }
}

/**
 * Tier 3 (ADR-4): AI fallback for whatever rules and Plaid categories left
 * uncategorized. Merchant strings only; unsure stays in the review queue.
 */
async function applyAiCategorization(userId: string): Promise<void> {
  if (!aiEnabled()) return;
  const pending = await db
    .select()
    .from(schema.transactions)
    .where(
      and(eq(schema.transactions.userId, userId), eq(schema.transactions.categorySource, 'none')),
    )
    .limit(40);
  if (pending.length === 0) return;

  const categories = await ensureDefaultCategories(userId);
  const spendingNames = [...categories.keys()];
  const results = await categorizeWithAI(
    pending.map((t) => t.merchantName ?? t.name),
    spendingNames,
  );
  for (const r of results) {
    if (!r.category) continue;
    const categoryId = categories.get(r.category);
    const txn = pending[r.index];
    if (!categoryId || !txn) continue;
    await db
      .update(schema.transactions)
      .set({ categoryId, categorySource: 'ai', updatedAt: new Date() })
      .where(eq(schema.transactions.id, txn.id));
  }
}

/**
 * The one sync path (ARCHITECTURE ADR-5): webhook, cron sweep, and the manual
 * refresh button all end up here. Idempotent — safe to run repeatedly.
 */
export async function syncItem(itemId: string): Promise<{ touched: number }> {
  const [item] = await db.select().from(schema.plaidItems).where(eq(schema.plaidItems.id, itemId));
  if (!item) throw new Error(`Unknown item ${itemId}`);
  if (item.provider !== 'plaid' || !item.accessTokenEnc) return { touched: 0 };

  try {
    const accountIds = await upsertAccounts(item);
    const touched = await syncTransactions(item, accountIds);
    await syncLiabilities(item, accountIds);
    await syncRecurring(item, accountIds);
    await applyAiCategorization(item.userId).catch((err) =>
      console.error('[ai categorization]', err),
    );
    await computeAndSnapshot(item.userId, 'sync');
    await listGoalsWithEtas(item.userId, { recordHistory: true, trigger: 'sync' });
    return { touched };
  } catch (err) {
    // Surface login-required items to the UI instead of failing silently.
    const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data
      ?.error_code;
    if (code === 'ITEM_LOGIN_REQUIRED') {
      await db
        .update(schema.plaidItems)
        .set({ status: 'login_required' })
        .where(eq(schema.plaidItems.id, itemId));
    }
    throw err;
  }
}

export async function syncAllItemsForUser(userId: string): Promise<{ touched: number }> {
  const items = await db
    .select()
    .from(schema.plaidItems)
    .where(and(eq(schema.plaidItems.userId, userId), eq(schema.plaidItems.provider, 'plaid')));
  let touched = 0;
  for (const item of items) {
    touched += (await syncItem(item.id)).touched;
  }
  return { touched };
}
