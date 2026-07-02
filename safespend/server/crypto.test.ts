import { beforeAll, describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './crypto';

describe('token encryption (AES-256-GCM)', () => {
  beforeAll(() => {
    process.env.PLAID_TOKEN_KEY = 'a'.repeat(64);
  });

  it('round-trips tokens exactly', () => {
    const token = 'access-sandbox-12345-abcdef';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('produces a fresh ciphertext per call (random IV)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('rejects tampered ciphertext (auth tag)', () => {
    const enc = Buffer.from(encryptToken('secret'), 'base64');
    enc[enc.length - 1]! ^= 0xff;
    expect(() => decryptToken(enc.toString('base64'))).toThrow();
  });

  it('refuses to run with a malformed key', () => {
    const old = process.env.PLAID_TOKEN_KEY;
    process.env.PLAID_TOKEN_KEY = 'short';
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
    process.env.PLAID_TOKEN_KEY = old;
  });
});
