/**
 * Cash-flow forecast — shared types. Spec: docs/budget/PRD.md §7.
 * Sign convention is NATURAL: inflows positive, outflows negative.
 */

export type ForecastEventType =
  | 'paycheck'
  | 'bill'
  | 'debt_payment'
  | 'goal_transfer'
  | 'planned';

export interface ForecastEvent {
  id: string;
  dateISO: string;
  /** Signed: +inflow, −outflow. */
  amountCents: number;
  label: string;
  type: ForecastEventType;
}

export interface ForecastInputs {
  /** First projected day (usually tomorrow; today's balance is the anchor). */
  startISO: string;
  horizonDays: number;
  /** Current available cash across opted-in accounts. */
  startingBalanceCents: number;
  /** Dated known events within the horizon. */
  events: ForecastEvent[];
  /** Estimated discretionary spend applied every day (magnitude ≥ 0). */
  dailyDiscretionaryCents: number;
}

export interface ForecastDay {
  dateISO: string;
  events: ForecastEvent[];
  /** Projected balance at end of this day. */
  endBalanceCents: number;
}

export interface ForecastResult {
  days: ForecastDay[];
  /** Day with the lowest projected end-of-day balance. */
  minDay: { dateISO: string; endBalanceCents: number };
  endBalanceCents: number;
}
