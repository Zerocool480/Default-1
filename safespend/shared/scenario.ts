/**
 * Purchase Intelligence — shared types. Spec: docs/budget/PRD.md §9 + G2.
 */
import type { EngineResult } from './engine';

export type PurchaseVerdict = 'yes' | 'tight' | 'not_now';
export type PurchaseRisk = 'low' | 'moderate' | 'high';

export interface PurchaseImpact {
  kind:
    | 'bills_covered'
    | 'bills_short'
    | 'floor_safe'
    | 'floor_dip'
    | 'allowance_change'
    | 'goal_reserve_at_risk'
    | 'days_of_spending';
  text: string;
  /** Positive facts render with a check, cautions with an arrow/warning. */
  tone: 'good' | 'change' | 'warn';
  data?: Record<string, number | string>;
}

export interface PurchaseEvaluation {
  verdict: PurchaseVerdict;
  risk: PurchaseRisk;
  headline: string;
  impacts: PurchaseImpact[];
  before: EngineResult;
  after: EngineResult;
  /** Projected minimum balances over the horizon, for the impact chart. */
  forecastMinBeforeCents: number;
  forecastMinAfterCents: number;
}
