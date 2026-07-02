import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';

/**
 * Default per-user category taxonomy, and the tier-2 mapping from Plaid
 * personal-finance categories onto it (ARCHITECTURE ADR-4).
 */
export const DEFAULT_CATEGORIES: Array<{
  name: string;
  kind: 'income' | 'spending' | 'transfer' | 'savings';
  isDiscretionary: boolean;
  icon: string;
}> = [
  { name: 'Income', kind: 'income', isDiscretionary: false, icon: 'banknote' },
  { name: 'Housing', kind: 'spending', isDiscretionary: false, icon: 'home' },
  { name: 'Utilities', kind: 'spending', isDiscretionary: false, icon: 'zap' },
  { name: 'Groceries', kind: 'spending', isDiscretionary: false, icon: 'shopping-cart' },
  { name: 'Transport', kind: 'spending', isDiscretionary: false, icon: 'car' },
  { name: 'Insurance', kind: 'spending', isDiscretionary: false, icon: 'shield' },
  { name: 'Medical', kind: 'spending', isDiscretionary: false, icon: 'heart-pulse' },
  { name: 'Debt Payments', kind: 'spending', isDiscretionary: false, icon: 'credit-card' },
  { name: 'Subscriptions', kind: 'spending', isDiscretionary: false, icon: 'repeat' },
  { name: 'Fees', kind: 'spending', isDiscretionary: false, icon: 'receipt' },
  { name: 'Restaurants', kind: 'spending', isDiscretionary: true, icon: 'utensils' },
  { name: 'Coffee', kind: 'spending', isDiscretionary: true, icon: 'coffee' },
  { name: 'Fun', kind: 'spending', isDiscretionary: true, icon: 'gamepad-2' },
  { name: 'Shopping', kind: 'spending', isDiscretionary: true, icon: 'shopping-bag' },
  { name: 'Personal Care', kind: 'spending', isDiscretionary: true, icon: 'sparkles' },
  { name: 'Travel', kind: 'spending', isDiscretionary: true, icon: 'plane' },
  { name: 'Savings', kind: 'savings', isDiscretionary: false, icon: 'piggy-bank' },
  { name: 'Transfers', kind: 'transfer', isDiscretionary: false, icon: 'arrow-left-right' },
];

/** Plaid PFC primary → our category name. Unmapped → review queue. */
const PFC_PRIMARY_MAP: Record<string, string> = {
  INCOME: 'Income',
  RENT_AND_UTILITIES: 'Utilities',
  FOOD_AND_DRINK: 'Restaurants',
  GENERAL_MERCHANDISE: 'Shopping',
  TRANSPORTATION: 'Transport',
  TRAVEL: 'Travel',
  ENTERTAINMENT: 'Fun',
  PERSONAL_CARE: 'Personal Care',
  MEDICAL: 'Medical',
  LOAN_PAYMENTS: 'Debt Payments',
  BANK_FEES: 'Fees',
  TRANSFER_IN: 'Transfers',
  TRANSFER_OUT: 'Transfers',
  HOME_IMPROVEMENT: 'Housing',
  GENERAL_SERVICES: 'Fees',
  GOVERNMENT_AND_NON_PROFIT: 'Fees',
};

/** Detailed PFC codes that beat the primary mapping when present. */
const PFC_DETAILED_MAP: Record<string, string> = {
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  FOOD_AND_DRINK_COFFEE: 'Coffee',
  RENT_AND_UTILITIES_RENT: 'Housing',
  GENERAL_MERCHANDISE_SUBSCRIPTION_SERVICES: 'Subscriptions',
  ENTERTAINMENT_STREAMING_SERVICES: 'Subscriptions',
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Subscriptions',
  TRANSPORTATION_GAS: 'Transport',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Debt Payments',
  INCOME_WAGES: 'Income',
};

export function mapPfcToCategoryName(
  primary: string | null | undefined,
  detailed: string | null | undefined,
): string | null {
  if (detailed && PFC_DETAILED_MAP[detailed]) return PFC_DETAILED_MAP[detailed];
  if (primary && PFC_PRIMARY_MAP[primary]) return PFC_PRIMARY_MAP[primary];
  return null;
}

/** Create the default taxonomy for a user if they have none; returns name→id. */
export async function ensureDefaultCategories(userId: string): Promise<Map<string, string>> {
  const existing = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.userId, userId));
  const byName = new Map(existing.map((c) => [c.name, c.id]));
  for (const def of DEFAULT_CATEGORIES) {
    if (byName.has(def.name)) continue;
    const [row] = await db
      .insert(schema.categories)
      .values({ userId, ...def })
      .returning();
    byName.set(def.name, row!.id);
  }
  return byName;
}
