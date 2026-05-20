import { pgTable, serial, text, integer, boolean, timestamp, numeric } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  sleeperUsername: text('sleeper_username'),
  sleeperUserId: text('sleeper_user_id'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  loyaltyEligible: boolean('loyalty_eligible').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const punchCards = pgTable('punch_cards', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  visits: integer('visits').default(0).notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const qrCodes = pgTable('qr_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  weekNumber: integer('week_number').notNull(),
  seasonYear: integer('season_year').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const punchCardScans = pgTable('punch_card_scans', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  qrCodeId: integer('qr_code_id').references(() => qrCodes.id).notNull(),
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
})

export const loyaltyParticipants = pgTable('loyalty_participants', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  confirmedAt: timestamp('confirmed_at').defaultNow().notNull(),
  hasPaid: boolean('has_paid').default(false).notNull(),
})

export const prizeConfig = pgTable('prize_config', {
  id: serial('id').primaryKey(),
  freeLeagueBudget: numeric('free_league_budget', { precision: 10, scale: 2 }).default('0').notNull(),
  loyaltyParticipantCount: integer('loyalty_participant_count').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const leagueSettings = pgTable('league_settings', {
  id: serial('id').primaryKey(),
  sleeperLeagueId: text('sleeper_league_id'),
  season: integer('season').default(2026).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert
export type PunchCard = typeof punchCards.$inferSelect
export type QrCode = typeof qrCodes.$inferSelect
export type PunchCardScan = typeof punchCardScans.$inferSelect
export type LoyaltyParticipant = typeof loyaltyParticipants.$inferSelect
export type PrizeConfig = typeof prizeConfig.$inferSelect
