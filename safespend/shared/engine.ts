/**
 * Daily Spending Engine — shared types.
 *
 * These types cross all three layers: the pure compute function
 * (intelligence/engine), the snapshot rows (db), and the Today screen (src).
 * Sign convention here is NATURAL: amounts are magnitudes, direction is
 * carried by the field's meaning (obligations subtract, cash adds).
 */

export type ObligationKind = 'bill' | 'debt_minimum' | 'planned';

export interface ObligationInput {
  /** Stable id (stream/liability/planned-txn id) for line-item refs. */
  id: string;
  label: string;
  amountCents: number; // magnitude, > 0
  dueDateISO: string;
  kind: ObligationKind;
}

export interface EngineInputs {
  /** User-local calendar date the number applies to. */
  todayISO: string;
  /** Next expected income date; the period is [today, periodEnd). */
  periodEndISO: string;
  /** How the period end was determined — shown in the breakdown. */
  periodSource: 'next_paycheck' | 'calendar_month';
  /** Σ available balances of opted-in spending accounts. */
  availableCashCents: number;
  /** Unpaid obligations due within the period (already de-duplicated
   *  against payments made this period by the caller). */
  obligations: ObligationInput[];
  /** Goal contributions still owed within the period. */
  goalReserveCents: number;
  /** User's minimum cash cushion. */
  emergencyFloorCents: number;
  /** Discretionary spending already made today (pending + posted + credit). */
  spentTodayCents: number;
  /**
   * Minimum projected balance across the period from the cash-flow forecast,
   * if available (null before M4). When the projection dips below the
   * emergency floor, the pool is clamped down by the dip so the engine
   * prevents the dip instead of reporting it afterward.
   */
  forecastMinBalanceCents: number | null;
}

export type EngineStatus = 'ok' | 'tight' | 'hold';

export interface EngineLineItem {
  label: string;
  /** Signed for display: cash positive, deductions negative. */
  amountCents: number;
  kind: 'cash' | 'obligation' | 'goal' | 'floor' | 'forecast_clamp' | 'divide' | 'spent';
  /** Ids of the underlying records (obligation ids etc.), for drill-down. */
  refs?: string[];
}

export interface EngineRecoveryPlan {
  /** How far below zero the raw pool is. */
  shortfallCents: number;
  /** Suggested daily underspend to recover by period end. */
  perDayCents: number;
}

export interface EngineResult {
  /** The number. Never negative — a shortfall renders as 0 + recovery plan. */
  safeToSpendTodayCents: number;
  /** Today's allowance before subtracting what was already spent. */
  dailyAllowanceCents: number;
  /** Pool after all deductions, floored at 0. */
  discretionaryPoolCents: number;
  /** Pool before flooring — negative when overcommitted. */
  rawPoolCents: number;
  daysLeft: number;
  periodEndISO: string;
  periodSource: 'next_paycheck' | 'calendar_month';
  status: EngineStatus;
  lineItems: EngineLineItem[];
  recovery: EngineRecoveryPlan | null;
  clampedByForecastCents: number;
  spentTodayCents: number;
}
