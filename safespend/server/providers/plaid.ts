/**
 * Plaid implementation of the bank-provider seam (ARCHITECTURE ADR-3).
 * Access tokens are decrypted only inside this module and never logged.
 */
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type AccountBase,
  type RemovedTransaction,
  type Transaction,
  type TransactionStream,
} from 'plaid';
import { decryptToken } from '../crypto';

export function plaidEnabled(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

let cached: PlaidApi | null = null;
export function plaidClient(): PlaidApi {
  if (!plaidEnabled()) throw new Error('Plaid is not configured (PLAID_CLIENT_ID/PLAID_SECRET)');
  if (cached) return cached;
  const env = process.env.PLAID_ENV ?? 'sandbox';
  const basePath = PlaidEnvironments[env];
  if (!basePath) throw new Error(`Unknown PLAID_ENV: ${env}`);
  cached = new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    }),
  );
  return cached;
}

export async function createLinkToken(userId: string): Promise<string> {
  const res = await plaidClient().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'SafeSpend',
    products: [Products.Transactions],
    optional_products: [Products.Liabilities],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return res.data.link_token;
}

export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const res = await plaidClient().itemPublicTokenExchange({ public_token: publicToken });
  return { accessToken: res.data.access_token, itemId: res.data.item_id };
}

export interface SyncPage {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
  hasMore: boolean;
}

export async function syncTransactionsPage(
  accessTokenEnc: string,
  cursor: string | null,
): Promise<SyncPage> {
  const res = await plaidClient().transactionsSync({
    access_token: decryptToken(accessTokenEnc),
    cursor: cursor ?? undefined,
    count: 250,
  });
  return {
    added: res.data.added,
    modified: res.data.modified,
    removed: res.data.removed,
    nextCursor: res.data.next_cursor,
    hasMore: res.data.has_more,
  };
}

export async function getAccounts(accessTokenEnc: string): Promise<AccountBase[]> {
  const res = await plaidClient().accountsGet({ access_token: decryptToken(accessTokenEnc) });
  return res.data.accounts;
}

export async function getInstitutionName(institutionId: string): Promise<string | null> {
  try {
    const res = await plaidClient().institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    return res.data.institution.name;
  } catch {
    return null;
  }
}

export interface LiabilityInfo {
  plaidAccountId: string;
  minPayment: string | null;
  nextDueDate: string | null;
  lastStatementBalance: string | null;
  apr: string | null;
}

export async function getLiabilities(accessTokenEnc: string): Promise<LiabilityInfo[]> {
  try {
    const res = await plaidClient().liabilitiesGet({
      access_token: decryptToken(accessTokenEnc),
    });
    const out: LiabilityInfo[] = [];
    for (const c of res.data.liabilities.credit ?? []) {
      if (!c.account_id) continue;
      const apr = c.aprs?.find((a) => a.apr_type === 'purchase_apr') ?? c.aprs?.[0];
      out.push({
        plaidAccountId: c.account_id,
        minPayment: c.minimum_payment_amount?.toFixed(2) ?? null,
        nextDueDate: c.next_payment_due_date ?? null,
        lastStatementBalance: c.last_statement_balance?.toFixed(2) ?? null,
        apr: apr ? apr.apr_percentage.toFixed(3) : null,
      });
    }
    for (const l of [...(res.data.liabilities.student ?? []), ...(res.data.liabilities.mortgage ?? [])]) {
      if (!l.account_id) continue;
      out.push({
        plaidAccountId: l.account_id,
        minPayment:
          'minimum_payment_amount' in l && l.minimum_payment_amount != null
            ? l.minimum_payment_amount.toFixed(2)
            : ('next_monthly_payment' in l && l.next_monthly_payment != null
                ? l.next_monthly_payment.toFixed(2)
                : null),
        nextDueDate: l.next_payment_due_date ?? null,
        lastStatementBalance: null,
        apr: null,
      });
    }
    return out;
  } catch {
    // Not every institution supports liabilities; that's fine.
    return [];
  }
}

export async function getRecurringStreams(
  accessTokenEnc: string,
): Promise<{ inflow: TransactionStream[]; outflow: TransactionStream[] }> {
  try {
    const res = await plaidClient().transactionsRecurringGet({
      access_token: decryptToken(accessTokenEnc),
    });
    return { inflow: res.data.inflow_streams, outflow: res.data.outflow_streams };
  } catch {
    return { inflow: [], outflow: [] };
  }
}
