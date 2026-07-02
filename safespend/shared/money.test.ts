import { describe, expect, it } from 'vitest';
import { formatCents, fromCents, toCents } from './money';

describe('money conversions', () => {
  it('round-trips DB decimal strings exactly', () => {
    for (const s of ['0.00', '0.01', '1234.56', '-12.30', '99999999.99', '-0.01']) {
      expect(fromCents(toCents(s))).toBe(s);
    }
  });

  it('parses single-decimal and integer forms', () => {
    expect(toCents('5')).toBe(500);
    expect(toCents('5.5')).toBe(550);
    expect(toCents('-3.7')).toBe(-370);
  });

  it('rejects malformed input instead of guessing', () => {
    for (const bad of ['', '1.234', 'abc', '1,234.00', 'NaN', '1.2.3', '$5']) {
      expect(() => toCents(bad), bad).toThrow();
    }
  });

  it('rejects non-integer cents', () => {
    expect(() => fromCents(10.5)).toThrow();
  });

  it('formats for display', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-1230)).toBe('-$12.30');
    expect(formatCents(4783)).toBe('$47.83');
    expect(formatCents(4783, { sign: true })).toBe('+$47.83');
    expect(formatCents(0)).toBe('$0.00');
  });
});
