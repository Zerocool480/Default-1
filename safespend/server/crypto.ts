/**
 * AES-256-GCM encryption for aggregator access tokens at rest.
 * Wire format: base64(iv[12] · authTag[16] · ciphertext).
 * The key never leaves the server; tokens are decrypted only inside the
 * provider layer and never logged or selected by API queries.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const hex = process.env.PLAID_TOKEN_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('PLAID_TOKEN_KEY must be 32 bytes hex (64 chars)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptToken(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
