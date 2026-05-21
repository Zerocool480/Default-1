import { pgTable, serial, text, integer, boolean, timestamp, numeric, unique } from 'drizzle-orm/pg-core'

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

export const nflPlayers = pgTable('nfl_players', {
  id: serial('id').primaryKey(),
  espnId: text('espn_id').notNull().unique(),
  name: text('name').notNull(),
  position: text('position').notNull(), // QB, RB, WR, TE
  team: text('team').notNull().default('FA'),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const weeklyLineups = pgTable('weekly_lineups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
}, t => [unique().on(t.userId, t.week, t.season)])

export const lineupSlots = pgTable('lineup_slots', {
  id: serial('id').primaryKey(),
  lineupId: integer('lineup_id').references(() => weeklyLineups.id).notNull(),
  playerId: integer('player_id').references(() => nflPlayers.id).notNull(),
  slotType: text('slot_type').notNull(), // QB, RB, WR, TE, FLEX
  fantasyPoints: numeric('fantasy_points', { precision: 6, scale: 2 }),
})

export const playerWeeklyScores = pgTable('player_weekly_scores', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => nflPlayers.id).notNull(),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  fantasyPoints: numeric('fantasy_points', { precision: 6, scale: 2 }).default('0').notNull(),
  passingYards: integer('passing_yards').default(0),
  passingTDs: integer('passing_tds').default(0),
  interceptions: integer('interceptions').default(0),
  rushingYards: integer('rushing_yards').default(0),
  rushingTDs: integer('rushing_tds').default(0),
  receptions: integer('receptions').default(0),
  receivingYards: integer('receiving_yards').default(0),
  receivingTDs: integer('receiving_tds').default(0),
  fumblesLost: integer('fumbles_lost').default(0),
  isFinal: boolean('is_final').default(false).notNull(),
}, t => [unique().on(t.playerId, t.week, t.season)])

export const usedPlayers = pgTable('used_players', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  playerId: integer('player_id').references(() => nflPlayers.id).notNull(),
  segmentNumber: integer('segment_number').notNull(),
  season: integer('season').notNull(),
  week: integer('week').notNull(),
}, t => [unique().on(t.userId, t.playerId, t.segmentNumber, t.season)])

export const weekStatus = pgTable('week_status', {
  id: serial('id').primaryKey(),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
  scoresFinalized: boolean('scores_finalized').default(false).notNull(),
}, t => [unique().on(t.week, t.season)])

export type NflPlayer = typeof nflPlayers.$inferSelect
export type WeeklyLineup = typeof weeklyLineups.$inferSelect
export type LineupSlot = typeof lineupSlots.$inferSelect
export type PlayerWeeklyScore = typeof playerWeeklyScores.$inferSelect
export type UsedPlayer = typeof usedPlayers.$inferSelect
export type WeekStatus = typeof weekStatus.$inferSelect
