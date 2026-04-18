import { createHash } from 'node:crypto';
import type { SessionOptions } from 'iron-session';
import { env } from '@/lib/env';

/**
 * Device-lock cookie payload carried inside the iron-session-sealed cookie
 * `airplex_device_<linkId>`. The cookie is per-link (one per share) so that
 * two different shares on the same browser don't collide.
 */
export interface DeviceLockCookiePayload {
  link_id: string;
  device_fp: string;
  issued_at: number;
}

const LINK_ID_RE = /^[A-Za-z0-9_-]{6,24}$/;
const MAX_TTL_SECONDS = 30 * 86400;

/**
 * Returns the per-link iron-session cookie name. Narrow the linkId shape so
 * a bad caller can never generate a malformed Set-Cookie header.
 */
export function cookieNameFor(linkId: string): string {
  if (!LINK_ID_RE.test(linkId)) {
    throw new Error('invalid linkId for cookie name');
  }
  return `airplex_device_${linkId}`;
}

/**
 * iron-session v8 config for the device-lock cookie. `secure` is relaxed in
 * `NODE_ENV=test` so Playwright can drive the flow over http://localhost.
 */
export function ironConfigFor(linkId: string, ttlSeconds: number): SessionOptions {
  return {
    password: env.DEVICE_LOCK_SECRET,
    cookieName: cookieNameFor(linkId),
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV !== 'test',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.min(ttlSeconds, MAX_TTL_SECONDS),
    },
  };
}

/**
 * Stable 32-char hex fingerprint derived from UA + Accept-Language. Keyed
 * with `DEVICE_LOCK_SECRET` so fingerprints aren't portable across deployments.
 */
export function computeDeviceFp(userAgent: string, acceptLanguage: string): string {
  return createHash('sha256')
    .update(`${userAgent}\n${acceptLanguage}\n${env.DEVICE_LOCK_SECRET}`)
    .digest('hex')
    .slice(0, 32);
}
