/**
 * Seed a demo user with two months of realistic finances, anchored to the
 * current date so the Safe-to-Spend demo is always coherent. Doubles as the
 * no-Plaid demo mode (ManualProvider data shape) and dev fixture.
 *
 * Idempotent: wipes and recreates the demo user only.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../db';
import { addDays, todayInTimezone } from '../shared/dates';
import { computeAndSnapshot } from '../server/services/engineService';
import { listGoalsWithEtas } from '../server/services/goalService';

const DEMO_EMAIL = 'demo@safespend.local';
const DEMO_PASSWORD = 'demo-password-1';
const TZ = 'America/New_York';

async function main() {
  const today = todayInTimezone(TZ);
  const d = (offset: number) => addDays(today, offset);

  // ---- wipe previous demo user (cascades everywhere) ----
  await db.delete(schema.users).where(eq(schema.users.email, DEMO_EMAIL));

  const [user] = await db
    .insert(schema.users)
    .values({ email: DEMO_EMAIL, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12) })
    .returning();
  const userId = user!.id;
  await db.insert(schema.userSettings).values({ userId, timezone: TZ, emergencyFloor: '500.00' });

  // ---- institution + accounts ----
  const [item] = await db
    .insert(schema.plaidItems)
    .values({ userId, provider: 'manual', institutionName: 'Demo Bank', lastSyncedAt: new Date() })
    .returning();

  const [checking] = await db
    .insert(schema.accounts)
    .values({
      userId,
      itemId: item!.id,
      name: 'Everyday Checking',
      type: 'depository',
      subtype: 'checking',
      mask: '4821',
      currentBalance: '2310.00',
      availableBalance: '2310.00',
      includeInCashPool: true,
      balancesUpdatedAt: new Date(),
    })
    .returning();
  const [savings] = await db
    .insert(schema.accounts)
    .values({
      userId,
      itemId: item!.id,
      name: 'High-Yield Savings',
      type: 'depository',
      subtype: 'savings',
      mask: '7710',
      currentBalance: '5200.00',
      availableBalance: '5200.00',
      includeInCashPool: false,
      balancesUpdatedAt: new Date(),
    })
    .returning();
  const [visa] = await db
    .insert(schema.accounts)
    .values({
      userId,
      itemId: item!.id,
      name: 'Visa Rewards',
      type: 'credit',
      subtype: 'credit card',
      mask: '9042',
      currentBalance: '1830.00',
      creditLimit: '6000.00',
      includeInCashPool: false,
      balancesUpdatedAt: new Date(),
    })
    .returning();

  await db.insert(schema.liabilities).values({
    accountId: visa!.id,
    minPayment: '250.00',
    nextDueDate: d(9),
    lastStatementBalance: '1830.00',
    apr: '22.900',
  });

  // ---- categories ----
  const catDefs: Array<{ name: string; kind: string; disc: boolean; icon: string }> = [
    { name: 'Income', kind: 'income', disc: false, icon: 'banknote' },
    { name: 'Housing', kind: 'spending', disc: false, icon: 'home' },
    { name: 'Utilities', kind: 'spending', disc: false, icon: 'zap' },
    { name: 'Groceries', kind: 'spending', disc: false, icon: 'shopping-cart' },
    { name: 'Transport', kind: 'spending', disc: false, icon: 'car' },
    { name: 'Insurance', kind: 'spending', disc: false, icon: 'shield' },
    { name: 'Debt Payments', kind: 'spending', disc: false, icon: 'credit-card' },
    { name: 'Subscriptions', kind: 'spending', disc: false, icon: 'repeat' },
    { name: 'Restaurants', kind: 'spending', disc: true, icon: 'utensils' },
    { name: 'Coffee', kind: 'spending', disc: true, icon: 'coffee' },
    { name: 'Fun', kind: 'spending', disc: true, icon: 'gamepad-2' },
    { name: 'Shopping', kind: 'spending', disc: true, icon: 'shopping-bag' },
    { name: 'Personal Care', kind: 'spending', disc: true, icon: 'sparkles' },
    { name: 'Savings', kind: 'savings', disc: false, icon: 'piggy-bank' },
    { name: 'Transfers', kind: 'transfer', disc: false, icon: 'arrow-left-right' },
  ];
  const cats = new Map<string, string>();
  for (const c of catDefs) {
    const [row] = await db
      .insert(schema.categories)
      .values({ userId, name: c.name, kind: c.kind, isDiscretionary: c.disc, icon: c.icon })
      .returning();
    cats.set(c.name, row!.id);
  }
  const cat = (name: string) => {
    const id = cats.get(name);
    if (!id) throw new Error(`missing category ${name}`);
    return id;
  };

  // ---- recurring streams ----
  // Paycheck: biweekly, last landed 6 days ago → next in 8 days.
  const [paycheck] = await db
    .insert(schema.recurringStreams)
    .values({
      userId,
      accountId: checking!.id,
      direction: 'inflow',
      description: 'Acme Corp payroll',
      merchantName: 'ACME CORP',
      categoryId: cat('Income'),
      frequency: 'biweekly',
      averageAmount: '2140.00',
      lastAmount: '2140.00',
      nextExpectedDate: d(8),
      status: 'confirmed',
      isEssential: true,
    })
    .returning();

  const outflowStreams: Array<{
    desc: string;
    merchant: string;
    category: string;
    freq: 'weekly' | 'biweekly' | 'monthly';
    amount: string;
    last?: string;
    next: string;
    essential: boolean;
    status?: string;
  }> = [
    // Inside the current pay period (next 8 days):
    { desc: 'Rent', merchant: 'OAKWOOD PROPERTIES', category: 'Housing', freq: 'monthly', amount: '980.00', next: d(2), essential: true },
    { desc: 'Electric bill', merchant: 'CITY POWER & LIGHT', category: 'Utilities', freq: 'monthly', amount: '84.00', next: d(5), essential: true },
    { desc: 'Internet', merchant: 'COMCAST', category: 'Utilities', freq: 'monthly', amount: '69.99', next: d(6), essential: true },
    { desc: 'Spotify', merchant: 'SPOTIFY', category: 'Subscriptions', freq: 'monthly', amount: '11.99', next: d(4), essential: false },
    // Beyond the period (should NOT hit the current pool, but DO forecast):
    { desc: 'Car insurance', merchant: 'GEICO', category: 'Insurance', freq: 'monthly', amount: '132.00', next: d(12), essential: true },
    { desc: 'Netflix', merchant: 'NETFLIX', category: 'Subscriptions', freq: 'monthly', amount: '15.49', next: d(16), essential: false },
    { desc: 'Gym membership', merchant: 'PLANET FITNESS', category: 'Subscriptions', freq: 'monthly', amount: '24.99', next: d(19), essential: false },
    // One detected-but-unconfirmed stream for the confirm queue:
    // Hulu's price recently went up — feeds the price-increase coach insight.
    { desc: 'Hulu', merchant: 'HULU', category: 'Subscriptions', freq: 'monthly', amount: '15.99', last: '17.99', next: d(11), essential: false, status: 'detected' },
  ];
  const streamIds = new Map<string, string>();
  for (const s of outflowStreams) {
    const [row] = await db
      .insert(schema.recurringStreams)
      .values({
        userId,
        accountId: checking!.id,
        direction: 'outflow',
        description: s.desc,
        merchantName: s.merchant,
        categoryId: cat(s.category),
        frequency: s.freq,
        averageAmount: s.amount,
        lastAmount: s.last ?? s.amount,
        nextExpectedDate: s.next,
        status: s.status ?? 'confirmed',
        isEssential: s.essential,
      })
      .returning();
    streamIds.set(s.desc, row!.id);
  }

  // ---- goals ----
  const [emergency] = await db
    .insert(schema.goals)
    .values({
      userId,
      name: 'Emergency Fund',
      targetAmount: '5000.00',
      fundedAmount: '3700.00',
      monthlyContribution: '150.00',
      linkedAccountId: savings!.id,
      priority: 1,
    })
    .returning();
  const [vacation] = await db
    .insert(schema.goals)
    .values({
      userId,
      name: 'Vacation',
      targetAmount: '2000.00',
      fundedAmount: '1300.00',
      monthlyContribution: '150.00',
      linkedAccountId: savings!.id,
      priority: 2,
    })
    .returning();
  // Emergency fund already got this month's contribution; vacation hasn't →
  // the engine reserves $150, and the breakdown shows why.
  await db.insert(schema.goalContributions).values({
    goalId: emergency!.id,
    amount: '150.00',
    date: addDays(today, -Math.min(3, Number(today.slice(8, 10)) - 1)),
  });
  void vacation;

  // ---- transaction history (~8 weeks) ----
  type Txn = {
    date: string;
    name: string;
    merchant: string | null;
    amount: string; // Plaid sign: + outflow, − inflow
    category: string | null;
    account?: 'checking' | 'visa';
    pending?: boolean;
    streamDesc?: string;
    source?: 'manual' | 'plaid';
  };
  const txns: Txn[] = [];

  // Paychecks every 14 days back from d(-6).
  for (let k = 0; k < 4; k++) {
    txns.push({
      date: d(-6 - 14 * k),
      name: 'Acme Corp payroll',
      merchant: 'ACME CORP',
      amount: '-2140.00',
      category: 'Income',
      streamDesc: '__paycheck__',
    });
  }
  // Monthly bills paid in past months (rent day ≈ d(2) minus a month, etc.).
  for (const past of [1, 2]) {
    txns.push(
      { date: addDays(d(2), -30 * past), name: 'Rent', merchant: 'OAKWOOD PROPERTIES', amount: '980.00', category: 'Housing', streamDesc: 'Rent' },
      { date: addDays(d(5), -30 * past), name: 'Electric bill', merchant: 'CITY POWER & LIGHT', amount: past === 1 ? '91.40' : '78.20', category: 'Utilities', streamDesc: 'Electric bill' },
      { date: addDays(d(6), -30 * past), name: 'Internet', merchant: 'COMCAST', amount: '69.99', category: 'Utilities', streamDesc: 'Internet' },
      { date: addDays(d(4), -30 * past), name: 'Spotify', merchant: 'SPOTIFY', amount: '11.99', category: 'Subscriptions', streamDesc: 'Spotify' },
      { date: addDays(d(12), -30 * past), name: 'Car insurance', merchant: 'GEICO', amount: '132.00', category: 'Insurance', streamDesc: 'Car insurance' },
      { date: addDays(d(16), -30 * past), name: 'Netflix', merchant: 'NETFLIX', amount: '15.49', category: 'Subscriptions', streamDesc: 'Netflix' },
      { date: addDays(d(19), -30 * past), name: 'Gym membership', merchant: 'PLANET FITNESS', amount: '24.99', category: 'Subscriptions', streamDesc: 'Gym membership' },
      { date: addDays(d(11), -30 * past), name: 'Hulu', merchant: 'HULU', amount: '17.99', category: 'Subscriptions', streamDesc: 'Hulu' },
      { date: addDays(d(9), -30 * past), name: 'Visa payment', merchant: 'VISA', amount: '250.00', category: 'Debt Payments' },
    );
  }
  // Weekly groceries + a believable spread of discretionary spending.
  const weeklySpread: Array<[number, string, string | null, string, string, 'checking' | 'visa']> = [
    [0, 'Trader Joes', 'TRADER JOES', '86.40', 'Groceries', 'checking'],
    [1, 'Blue Bottle Coffee', 'BLUE BOTTLE', '6.75', 'Coffee', 'visa'],
    [2, 'Chipotle', 'CHIPOTLE', '14.20', 'Restaurants', 'visa'],
    [3, 'Shell', 'SHELL OIL', '48.00', 'Transport', 'checking'],
    [4, 'Steam Games', 'STEAM', '19.99', 'Fun', 'visa'],
    [5, 'Thai Basil', 'THAI BASIL', '42.80', 'Restaurants', 'visa'],
    [6, 'Target', 'TARGET', '54.30', 'Shopping', 'visa'],
  ];
  for (let week = 1; week <= 8; week++) {
    for (const [dow, name, merchant, amount, category, account] of weeklySpread) {
      // Skip some entries pseudo-deterministically so weeks differ.
      if ((week * 7 + dow) % 3 === 0 && category !== 'Groceries') continue;
      txns.push({ date: d(-7 * week + dow), name, merchant, amount, category, account });
    }
  }
  // Today: a couple of small discretionary purchases (one pending).
  txns.push(
    { date: today, name: 'Blue Bottle Coffee', merchant: 'BLUE BOTTLE', amount: '6.40', category: 'Coffee', account: 'visa' },
    { date: today, name: 'Lyft', merchant: 'LYFT', amount: '6.40', category: 'Fun', account: 'visa', pending: true },
  );
  // Three recent uncategorized transactions → the review queue.
  txns.push(
    { date: d(-1), name: 'SQ *CORNER BAKERY 0042', merchant: null, amount: '9.80', category: null, account: 'visa' },
    { date: d(-2), name: 'AMZN Mktp US*Z9182', merchant: null, amount: '23.47', category: null, account: 'visa' },
    { date: d(-3), name: 'PP*TICKETFLY', merchant: null, amount: '35.00', category: null, account: 'checking' },
  );

  for (const t of txns) {
    if (t.date > today) continue; // history only
    await db.insert(schema.transactions).values({
      userId,
      accountId: t.account === 'visa' ? visa!.id : checking!.id,
      amount: t.amount,
      date: t.date,
      name: t.name,
      merchantName: t.merchant,
      categoryId: t.category ? cat(t.category) : null,
      categorySource: t.category ? 'plaid' : 'none',
      isPending: t.pending ?? false,
      source: 'manual',
      isRecurring: !!t.streamDesc,
      recurringStreamId:
        t.streamDesc === '__paycheck__'
          ? paycheck!.id
          : t.streamDesc
            ? (streamIds.get(t.streamDesc) ?? null)
            : null,
    });
  }

  // ---- budgets ----
  await db.insert(schema.budgets).values([
    { userId, categoryId: cat('Restaurants'), monthlyLimit: '220.00' },
    { userId, categoryId: cat('Coffee'), monthlyLimit: '40.00' },
    { userId, categoryId: cat('Fun'), monthlyLimit: '120.00' },
    { userId, categoryId: cat('Groceries'), monthlyLimit: '420.00' },
    { userId, categoryId: cat('Shopping'), monthlyLimit: '150.00' },
  ]);

  // ---- first snapshot + ETA trail ----
  const snapshot = await computeAndSnapshot(userId, 'manual');
  await listGoalsWithEtas(userId, { recordHistory: true, trigger: 'manual' });

  console.log('Seeded demo user:');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  Safe to Spend Today: $${snapshot.result.safeToSpendTodayCents / 100} (${snapshot.result.status})`);
  console.log(`  Period: ${snapshot.result.daysLeft} days until ${snapshot.result.periodEndISO}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().then(() => process.exit(1));
  });
