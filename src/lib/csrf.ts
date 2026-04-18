import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminSessionData } from '@/lib/session';

const HEX_32 = /^[0-9a-f]{32}$/i;

/**
 * Mint a fresh double-submit CSRF token (16 random bytes → 32 hex chars).
 * Stored on the session at login/issue time and echoed by the client via
 * the `x-airplex-csrf` request header on every mutating admin call.
 */
export function issueCsrf(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Constant-time compare of the session-bound CSRF token and the client-supplied
 * header value. Any malformed input (wrong length, non-hex) returns false.
 */
export function verifyCsrf(session: AdminSessionData, headerValue: string | null): boolean {
  const a = session.csrf;
  const b = headerValue;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!HEX_32.test(a) || !HEX_32.test(b)) return false;
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
