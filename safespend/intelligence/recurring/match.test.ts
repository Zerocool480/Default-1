import { describe, expect, it } from 'vitest';
import { matchStream, type MatchableStream, type MatchableTxn } from './match';

const rent: MatchableStream = {
  id: 'stream-rent',
  direction: 'outflow',
  merchantName: 'OAKWOOD PROPERTIES',
  description: 'Rent',
  frequency: 'monthly',
  averageAmountCents: 980_00,
  nextExpectedDateISO: '2026-07-03',
};

const txn = (over: Partial<MatchableTxn>): MatchableTxn => ({
  id: 'txn-1',
  dateISO: '2026-07-03',
  amountCents: 980_00,
  merchantName: 'OAKWOOD PROPERTIES',
  name: 'Rent payment',
  ...over,
});

describe('matchStream — the already-paid dedup', () => {
  it('matches an on-time payment and advances the anchor a month', () => {
    const m = matchStream(rent, [txn({})]);
    expect(m).toMatchObject({
      streamId: 'stream-rent',
      txnId: 'txn-1',
      newNextExpectedDateISO: '2026-08-03',
      lastAmountCents: 980_00,
    });
  });

  it('matches an early payment (rent paid 2 days before due)', () => {
    const m = matchStream(rent, [txn({ dateISO: '2026-07-01' })]);
    expect(m?.newNextExpectedDateISO).toBe('2026-08-03');
  });

  it('matches a late payment and still advances past it', () => {
    const m = matchStream(rent, [txn({ dateISO: '2026-07-08' })]);
    expect(m?.newNextExpectedDateISO).toBe('2026-08-03');
  });

  it('tolerates amount drift within 25% (utility bills vary)', () => {
    const electric: MatchableStream = {
      ...rent,
      id: 's-elec',
      merchantName: 'CITY POWER & LIGHT',
      description: 'Electric bill',
      averageAmountCents: 84_00,
    };
    const m = matchStream(electric, [
      txn({ merchantName: 'CITY POWER & LIGHT', amountCents: 97_40 }),
    ]);
    expect(m?.lastAmountCents).toBe(97_40);
  });

  it('refuses a same-merchant transaction with a wildly different amount', () => {
    // A $150 charge at the landlord's office is NOT this month's rent.
    expect(matchStream(rent, [txn({ amountCents: 150_00 })])).toBeNull();
  });

  it('refuses a matching amount from a different merchant', () => {
    expect(
      matchStream(rent, [txn({ merchantName: 'SOME STORE', name: 'SOME STORE 980' })]),
    ).toBeNull();
  });

  it('refuses dates outside the ±7 day window', () => {
    expect(matchStream(rent, [txn({ dateISO: '2026-07-15' })])).toBeNull();
  });

  it('refuses the wrong direction (a refund is not a bill payment)', () => {
    expect(matchStream(rent, [txn({ amountCents: -980_00 })])).toBeNull();
  });

  it('picks the closest transaction when several qualify', () => {
    const m = matchStream(rent, [
      txn({ id: 'far', dateISO: '2026-07-08' }),
      txn({ id: 'near', dateISO: '2026-07-03' }),
    ]);
    expect(m?.txnId).toBe('near');
  });

  it('matches biweekly paychecks (inflow) and advances 14 days', () => {
    const paycheck: MatchableStream = {
      id: 's-pay',
      direction: 'inflow',
      merchantName: 'ACME CORP',
      description: 'Acme Corp payroll',
      frequency: 'biweekly',
      averageAmountCents: 2_140_00,
      nextExpectedDateISO: '2026-07-09',
    };
    const m = matchStream(paycheck, [
      txn({ merchantName: 'ACME CORP', name: 'ACME CORP PAYROLL', amountCents: -2_140_00, dateISO: '2026-07-09' }),
    ]);
    expect(m?.newNextExpectedDateISO).toBe('2026-07-23');
  });

  it('fuzzy merchant containment works both directions', () => {
    const m = matchStream(rent, [
      txn({ merchantName: null, name: 'ACH OAKWOOD PROPERTIES LLC 0042' }),
    ]);
    expect(m?.txnId).toBe('txn-1');
  });

  it('no anchor date → no match (never guess)', () => {
    expect(matchStream({ ...rent, nextExpectedDateISO: null }, [txn({})])).toBeNull();
  });
});
