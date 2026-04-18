import crypto from 'node:crypto';

import { env } from './env';

/**
 * Issued share token per plan §A.2 and spec §6.
 *
 * Format: `<base64url(random_16_bytes)>.<base64url(hmac_sha256(SHARE_TOKEN_SECRET, random)[0:16])>`
 * Total length ~45 chars.
 *
 * Per plan §F item 2: `crypto.randomBytes(16)` and `crypto.createHmac` for
 * share-token generation live ONLY in this file. Consumers MUST import
 * `createShareToken` / `verifyShareTokenSignature` / `hashShareToken` rather
 * than re-implementing token crypto in route handlers.
 */
export interface IssuedShareToken {
  token: string;
  tokenHash: string;
}

const RAND_BYTES = 16;
const SIG_BYTES = 16;

function signRand(rand: Buffer): Buffer {
  // env.SHARE_TOKEN_SECRET is the validated raw env string (hex or base64 —
  // env.ts verifies it decodes to >=32 bytes). HMAC accepts any byte length
  // for the key, so we use the string directly as documented in the task.
  return crypto
    .createHmac('sha256', env.SHARE_TOKEN_SECRET)
    .update(rand)
    .digest()
    .subarray(0, SIG_BYTES);
}

export function createShareToken(): IssuedShareToken {
  const rand = crypto.randomBytes(RAND_BYTES);
  const sig = signRand(rand);
  const token = `${rand.toString('base64url')}.${sig.toString('base64url')}`;
  const tokenHash = hashShareToken(token);
  return { token, tokenHash };
}

export function verifyShareTokenSignature(token: string): boolean {
  try {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [randB64, sigB64] = parts;
    const rand = Buffer.from(randB64, 'base64url');
    const sig = Buffer.from(sigB64, 'base64url');
    if (rand.length !== RAND_BYTES) return false;
    if (sig.length !== SIG_BYTES) return false;
    const expected = signRand(rand);
    if (expected.length !== sig.length) return false;
    return crypto.timingSafeEqual(expected, sig);
  } catch {
    return false;
  }
}

export function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
