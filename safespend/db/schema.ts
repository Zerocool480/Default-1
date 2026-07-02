/**
 * SafeSpend schema — see docs/budget/DATABASE.md for the design rationale.
 *
 * Conventions:
 *  - money: numeric(14,2), surfaced to TS as decimal strings; converted to integer
 *    cents at the service boundary (shared/money.ts). Never floats.
 *  - transaction amounts follow the Plaid sign convention: positive = outflow.
 *  - every user-owned table carries user_id (multi-user-ready).
 */
import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('America/New_York'),
  emergencyFloor: money('emergency_floor').notNull().default('500.00'),
  periodStrategy: text('period_strategy').notNull().default('next_income'), // next_income | calendar_month
  currency: text('currency').notNull().default('USD'),
});

export const plaidItems = pgTable('plaid_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('manual'), // plaid | manual
  plaidItemId: text('plaid_item_id').unique(),
  accessTokenEnc: text('access_token_enc'),
  institutionId: text('institution_id'),
  institutionName: text('institution_name'),
  status: text('status').notNull().default('active'), // active | login_required | error | disconnected
  syncCursor: text('sync_cursor'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => plaidItems.id, { onDelete: 'cascade' }),
    plaidAccountId: text('plaid_account_id').unique(),
    name: text('name').notNull(),
    officialName: text('official_name'),
    type: text('type').notNull(), // depository | credit | loan | investment
    subtype: text('subtype'),
    mask: text('mask'),
    currentBalance: money('current_balance'),
    availableBalance: money('available_balance'),
    creditLimit: money('credit_limit'),
    includeInCashPool: boolean('include_in_cash_pool').notNull().default(false),
    isHidden: boolean('is_hidden').notNull().default(false),
    balancesUpdatedAt: timestamp('balances_updated_at', { withTimezone: true }),
  },
  (t) => ({ byUser: index('accounts_user_idx').on(t.userId) }),
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    kind: text('kind').notNull().default('spending'), // spending | income | transfer | savings
    isDiscretionary: boolean('is_discretionary').notNull().default(false),
    icon: text('icon'),
    color: text('color'),
  },
  (t) => ({ byUserName: uniqueIndex('categories_user_name_idx').on(t.userId, t.name) }),
);

export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    matcherType: text('matcher_type').notNull(), // merchant_exact | merchant_contains | plaid_detailed
    matcherValue: text('matcher_value').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(100),
    hitCount: integer('hit_count').notNull().default(0),
    createdFromTransactionId: uuid('created_from_transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('category_rules_user_idx').on(t.userId) }),
);

export const recurringStreams = pgTable(
  'recurring_streams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    plaidStreamId: text('plaid_stream_id'),
    direction: text('direction').notNull(), // inflow | outflow
    merchantName: text('merchant_name'),
    description: text('description').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    frequency: text('frequency').notNull(), // weekly | biweekly | semi_monthly | monthly | annual | irregular
    averageAmount: money('average_amount').notNull(),
    lastAmount: money('last_amount'),
    nextExpectedDate: date('next_expected_date'),
    status: text('status').notNull().default('detected'), // detected | confirmed | dismissed | ended
    isEssential: boolean('is_essential').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('recurring_streams_user_idx').on(t.userId) }),
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    plaidTransactionId: text('plaid_transaction_id').unique(),
    pendingPlaidId: text('pending_plaid_id'),
    /** Plaid sign convention: positive = money out, negative = money in. */
    amount: money('amount').notNull(),
    date: date('date').notNull(),
    authorizedDate: date('authorized_date'),
    merchantName: text('merchant_name'),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categorySource: text('category_source').notNull().default('none'), // rule | plaid | ai | user | none
    plaidPfcPrimary: text('plaid_pfc_primary'),
    plaidPfcDetailed: text('plaid_pfc_detailed'),
    isPending: boolean('is_pending').notNull().default(false),
    source: text('source').notNull().default('manual'), // plaid | manual | planned
    isRecurring: boolean('is_recurring').notNull().default(false),
    recurringStreamId: uuid('recurring_stream_id').references(() => recurringStreams.id, {
      onDelete: 'set null',
    }),
    excludeFromEngine: boolean('exclude_from_engine').notNull().default(false),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUserDate: index('transactions_user_date_idx').on(t.userId, t.date),
    byAccountDate: index('transactions_account_date_idx').on(t.accountId, t.date),
    byUserCategory: index('transactions_user_category_idx').on(t.userId, t.categoryId, t.date),
  }),
);

export const liabilities = pgTable('liabilities', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  minPayment: money('min_payment'),
  nextDueDate: date('next_due_date'),
  lastStatementBalance: money('last_statement_balance'),
  apr: numeric('apr', { precision: 6, scale: 3 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    monthlyLimit: money('monthly_limit').notNull(),
    rollover: boolean('rollover').notNull().default(false),
  },
  (t) => ({ byUserCategory: uniqueIndex('budgets_user_category_idx').on(t.userId, t.categoryId) }),
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetAmount: money('target_amount').notNull(),
    targetDate: date('target_date'),
    fundedAmount: money('funded_amount').notNull().default('0.00'),
    monthlyContribution: money('monthly_contribution').notNull().default('0.00'),
    linkedAccountId: uuid('linked_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    priority: integer('priority').notNull().default(100),
    status: text('status').notNull().default('active'), // active | paused | completed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUser: index('goals_user_idx').on(t.userId) }),
);

export const goalContributions = pgTable('goal_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => goals.id, { onDelete: 'cascade' }),
  amount: money('amount').notNull(),
  date: date('date').notNull(),
  transactionId: uuid('transaction_id'),
});

export const goalEtaHistory = pgTable(
  'goal_eta_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    etaDate: date('eta_date'),
    percentComplete: numeric('percent_complete', { precision: 5, scale: 2 }).notNull(),
    trigger: text('trigger').notNull(),
  },
  (t) => ({ byGoal: index('goal_eta_history_goal_idx').on(t.goalId, t.computedAt) }),
);

export const engineSnapshots = pgTable(
  'engine_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    forDate: date('for_date').notNull(),
    safeToSpend: money('safe_to_spend').notNull(),
    dailyAllowance: money('daily_allowance').notNull(),
    discretionaryPool: money('discretionary_pool').notNull(),
    daysLeft: integer('days_left').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').notNull(), // ok | tight | hold
    lineItems: jsonb('line_items').notNull(),
    inputsHash: text('inputs_hash').notNull(),
    trigger: text('trigger').notNull(), // sync | webhook | rollover | manual | settings | txn_edit
  },
  (t) => ({
    byUserDate: index('engine_snapshots_user_date_idx').on(t.userId, t.forDate, t.computedAt),
  }),
);

export const scoreSnapshots = pgTable(
  'score_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    forDate: date('for_date').notNull(),
    total: integer('total').notNull(),
    subScores: jsonb('sub_scores').notNull(),
    deltaReasons: jsonb('delta_reasons'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUserDate: index('score_snapshots_user_date_idx').on(t.userId, t.forDate) }),
);

export const briefings = pgTable(
  'briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    forDate: date('for_date').notNull(),
    healthScore: integer('health_score'),
    safeToSpend: money('safe_to_spend').notNull(),
    checkingTotal: money('checking_total').notNull(),
    upcomingBillsTotal: money('upcoming_bills_total').notNull(),
    goalsStatus: text('goals_status').notNull(), // on_track | attention | off_track
    recommendationCode: text('recommendation_code').notNull(),
    recommendationText: text('recommendation_text').notNull(),
    recommendationReasons: jsonb('recommendation_reasons').notNull(),
    deliveredVia: jsonb('delivered_via').notNull().default('["in_app"]'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byUserDate: uniqueIndex('briefings_user_date_idx').on(t.userId, t.forDate) }),
);

export const insights = pgTable(
  'insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    severity: text('severity').notNull().default('info'),
    data: jsonb('data'),
    status: text('status').notNull().default('active'), // active | dismissed | expired
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({ byUserStatus: index('insights_user_status_idx').on(t.userId, t.status) }),
);

export const copilotConversations = pgTable('copilot_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const copilotMessages = pgTable('copilot_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => copilotConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user | assistant
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls'),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const forecastChecks = pgTable('forecast_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  madeOn: date('made_on').notNull(),
  horizonDays: integer('horizon_days').notNull(),
  predictedBalance: money('predicted_balance').notNull(),
  actualBalance: money('actual_balance'),
  absErrorPct: numeric('abs_error_pct', { precision: 6, scale: 2 }),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
});

export const plaidWebhookEvents = pgTable('plaid_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id'),
  webhookType: text('webhook_type'),
  webhookCode: text('webhook_code'),
  payload: jsonb('payload'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
