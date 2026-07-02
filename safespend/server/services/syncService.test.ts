/**
 * Sync pipeline integration tests against a real Postgres (safespend_test)
 * with the Plaid provider mocked by recorded-shape fixtures — added/modified/
 * removed handling, pending→posted transitions, user-correction survival, and
 * recurring-stream confirmation preservation (ARCHITECTURE §6).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://safespend:safespend_dev@localhost:5432/safespend_test';
process.env.PLAID_TOKEN_KEY = 'b'.repeat(64);
process.env.JWT_SECRET = 'test-secret';

// ---- provider mock (hoisted before syncService import) ----
const fixtures = vi.hoisted(() => ({
  accounts: [] as unknown[],
  pages: [] as unknown[],
  liabilities: [] as unknown[],
  recurring: { inflow: [] as unknown[], outflow: [] as unknown[] },
}));

vi.mock('../providers/plaid', () => ({
  plaidEnabled: () => true,
  getAccounts: vi.fn(async () => fixtures.accounts),
  // Pages are consumed as a queue; the cursor value is opaque to the caller
  // (as it is with real Plaid), we just assert it gets persisted.
  syncTransactionsPage: vi.fn(async (_enc: string, cursor: string | null) => {
    const page = fixtures.pages.shift() ?? { added: [], modified: [], removed: [] };
    return {
      ...(page as object),
      nextCursor: String(Number(cursor ?? '0') + 1),
      hasMore: fixtures.pages.length > 0,
    };
  }),
  getLiabilities: vi.fn(async () => fixtures.liabilities),
  getRecurringStreams: vi.fn(async () => fixtures.recurring),
}));

const { db, pool, schema } = await import('../../db');
const { syncItem } = await import('./syncService');
const { eq, and } = await import('drizzle-orm');

const plaidAccount = (id: string, over: Record<string, unknown> = {}) => ({
  account_id: id,
  name: id === 'acc-credit' ? 'Test Visa' : 'Test Checking',
  official_name: null,
  mask: '1111',
  type: id === 'acc-credit' ? 'credit' : 'depository',
  subtype: id === 'acc-credit' ? 'credit card' : 'checking',
  balances: { current: 1500, available: 1450, limit: null },
  ...over,
});

const plaidTxn = (id: string, over: Record<string, unknown> = {}) => ({
  transaction_id: id,
  account_id: 'acc-checking',
  amount: 12.5,
  date: '2026-07-01',
  authorized_date: null,
  name: 'COFFEE SHOP',
  merchant_name: 'Coffee Shop',
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
  ...over,
});

let userId: string;
let itemId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `sync-test-${Date.now()}@test.local`, passwordHash: 'x' })
    .returning();
  userId = user!.id;
  await db.insert(schema.userSettings).values({ userId, timezone: 'UTC' });
  const [item] = await db
    .insert(schema.plaidItems)
    .values({ userId, provider: 'plaid', plaidItemId: `item-${Date.now()}`, accessTokenEnc: 'enc' })
    .returning();
  itemId = item!.id;
});

afterAll(async () => {
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await pool.end();
});

beforeEach(async () => {
  fixtures.accounts = [plaidAccount('acc-checking'), plaidAccount('acc-credit')];
  fixtures.pages = [];
  fixtures.liabilities = [];
  fixtures.recurring = { inflow: [], outflow: [] };
  // Each test provides its own page sequence from position 0.
  await db.update(schema.plaidItems).set({ syncCursor: null }).where(eq(schema.plaidItems.id, itemId));
});

describe('syncItem', () => {
  it('first sync: creates accounts, categorizes via PFC tier 2, stores cursor, snapshots', async () => {
    fixtures.pages = [
      {
        added: [
          plaidTxn('t1'),
          plaidTxn('t2', {
            name: 'PAYROLL',
            merchant_name: null,
            amount: -2000,
            personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' },
          }),
          plaidTxn('t3', {
            name: 'UNKNOWN VENDOR',
            merchant_name: null,
            personal_finance_category: null,
          }),
        ],
        modified: [],
        removed: [],
      },
    ];

    const { touched } = await syncItem(itemId);
    expect(touched).toBe(3);

    const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
    expect(accounts).toHaveLength(2);
    const checking = accounts.find((a) => a.plaidAccountId === 'acc-checking')!;
    expect(checking.includeInCashPool).toBe(true); // checking defaults into the pool
    expect(accounts.find((a) => a.plaidAccountId === 'acc-credit')!.includeInCashPool).toBe(false);
    expect(checking.availableBalance).toBe('1450.00');

    const txns = await db
      .select({ t: schema.transactions, c: schema.categories })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .where(eq(schema.transactions.userId, userId));
    expect(txns).toHaveLength(3);
    expect(txns.find((x) => x.t.plaidTransactionId === 't1')!.c!.name).toBe('Coffee'); // detailed beats primary
    expect(txns.find((x) => x.t.plaidTransactionId === 't2')!.c!.name).toBe('Income');
    const unknown = txns.find((x) => x.t.plaidTransactionId === 't3')!;
    expect(unknown.t.categorySource).toBe('none'); // review queue

    const [item] = await db.select().from(schema.plaidItems).where(eq(schema.plaidItems.id, itemId));
    expect(item!.syncCursor).toBe('1');
    expect(item!.lastSyncedAt).not.toBeNull();

    const snaps = await db
      .select()
      .from(schema.engineSnapshots)
      .where(eq(schema.engineSnapshots.userId, userId));
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps.at(-1)!.trigger).toBe('sync');
  });

  it('re-running the same page is idempotent', async () => {
    fixtures.pages = [{ added: [plaidTxn('t1')], modified: [], removed: [] }];
    await syncItem(itemId);
    const txns = await db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.plaidTransactionId, 't1')));
    expect(txns).toHaveLength(1);
  });

  it('pending→posted: updates the pending row in place and keeps user corrections', async () => {
    // A pending charge arrives…
    fixtures.pages = [
      { added: [plaidTxn('pend-1', { pending: true, amount: 20 })], modified: [], removed: [] },
    ];
    await syncItem(itemId);

    // …the user recategorizes it by hand…
    const [funCat] = await db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.userId, userId), eq(schema.categories.name, 'Fun')));
    const [pendingRow] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.plaidTransactionId, 'pend-1'));
    await db
      .update(schema.transactions)
      .set({ categoryId: funCat!.id, categorySource: 'user' })
      .where(eq(schema.transactions.id, pendingRow!.id));

    // …then the posted version replaces it.
    fixtures.pages = [
      {
        added: [plaidTxn('post-1', { pending: false, amount: 21.5, pending_transaction_id: 'pend-1' })],
        modified: [],
        removed: [],
      },
    ];
    await syncItem(itemId);

    const all = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.userId, userId));
    const posted = all.find((t) => t.plaidTransactionId === 'post-1');
    expect(posted).toBeDefined();
    expect(all.find((t) => t.plaidTransactionId === 'pend-1')).toBeUndefined(); // replaced, not duplicated
    expect(posted!.id).toBe(pendingRow!.id); // same row, corrections travel with it
    expect(posted!.categoryId).toBe(funCat!.id); // user category survived
    expect(posted!.categorySource).toBe('user');
    expect(posted!.amount).toBe('21.50');
    expect(posted!.isPending).toBe(false);
  });

  it('modified updates amounts; removed deletes', async () => {
    fixtures.pages = [{ added: [plaidTxn('t-mod'), plaidTxn('t-gone')], modified: [], removed: [] }];
    await syncItem(itemId);

    fixtures.pages = [
      {
        added: [],
        modified: [plaidTxn('t-mod', { amount: 99.99 })],
        removed: [{ transaction_id: 't-gone', account_id: 'acc-checking' }],
      },
    ];
    await syncItem(itemId);

    const all = await db.select().from(schema.transactions).where(eq(schema.transactions.userId, userId));
    expect(all.find((t) => t.plaidTransactionId === 't-mod')!.amount).toBe('99.99');
    expect(all.find((t) => t.plaidTransactionId === 't-gone')).toBeUndefined();
  });

  it('liabilities upsert onto credit accounts', async () => {
    fixtures.liabilities = [
      {
        plaidAccountId: 'acc-credit',
        minPayment: '35.00',
        nextDueDate: '2026-07-20',
        lastStatementBalance: '412.88',
        apr: '24.490',
      },
    ];
    await syncItem(itemId);
    const [credit] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.plaidAccountId, 'acc-credit'));
    const [liab] = await db
      .select()
      .from(schema.liabilities)
      .where(eq(schema.liabilities.accountId, credit!.id));
    expect(liab).toMatchObject({ minPayment: '35.00', nextDueDate: '2026-07-20' });
  });

  it('recurring: detected streams appear; user confirmation is never overwritten', async () => {
    const stream = {
      stream_id: 'stream-1',
      account_id: 'acc-checking',
      merchant_name: 'Netflix',
      description: 'NETFLIX.COM',
      frequency: 'MONTHLY',
      average_amount: { amount: 15.49 },
      last_amount: { amount: 15.49 },
      predicted_next_date: '2026-07-18',
      is_active: true,
    };
    fixtures.recurring = { inflow: [], outflow: [stream] };
    await syncItem(itemId);

    const [detected] = await db
      .select()
      .from(schema.recurringStreams)
      .where(eq(schema.recurringStreams.plaidStreamId, 'stream-1'));
    expect(detected).toMatchObject({
      status: 'detected',
      direction: 'outflow',
      frequency: 'monthly',
      averageAmount: '15.49',
    });

    // User confirms; the next sync updates data but not the decision.
    await db
      .update(schema.recurringStreams)
      .set({ status: 'confirmed' })
      .where(eq(schema.recurringStreams.id, detected!.id));
    fixtures.recurring = {
      inflow: [],
      outflow: [{ ...stream, predicted_next_date: '2026-08-18', average_amount: { amount: 17.99 } }],
    };
    await syncItem(itemId);

    const [after] = await db
      .select()
      .from(schema.recurringStreams)
      .where(eq(schema.recurringStreams.id, detected!.id));
    expect(after!.status).toBe('confirmed'); // decision preserved
    expect(after!.nextExpectedDate).toBe('2026-08-18'); // data refreshed
    expect(after!.averageAmount).toBe('17.99');
  });
});
