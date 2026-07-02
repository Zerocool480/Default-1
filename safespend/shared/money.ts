/**
 * All money math happens in integer cents. The database stores numeric(14,2)
 * which drizzle surfaces as decimal strings; these helpers are the only
 * conversion point. Floats never carry money anywhere in this codebase.
 */

/** "1234.56" | "-12.30" → 123456 | -1230. Throws on malformed input. */
export function toCents(decimal: string): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!m) throw new Error(`Invalid money string: ${JSON.stringify(decimal)}`);
  const [, sign, whole, frac = ''] = m;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

/** 123456 → "1234.56" (database / API wire format). */
export function fromCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Non-integer cents: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 123456 → "$1,234.56"; -1230 → "-$12.30" (display format). */
export function formatCents(cents: number, opts?: { sign?: boolean }): string {
  const sign = cents < 0 ? '-' : opts?.sign && cents > 0 ? '+' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}
