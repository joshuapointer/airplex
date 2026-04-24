import { createHash } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Stable 32-char hex fingerprint derived from UA + Accept-Language, keyed
 * with `DEVICE_LOCK_SECRET` so fingerprints aren't portable across
 * deployments.
 *
 * Airplex re-derives this fingerprint from the request headers on every
 * share-scoped request — there is no per-link session cookie. A browser
 * whose UA string changes (e.g. after a software update) will fail the
 * check; admin can reset the lock from the dashboard.
 */
export function computeDeviceFp(userAgent: string, acceptLanguage: string): string {
  return createHash('sha256')
    .update(`${userAgent}\n${acceptLanguage}\n${env.DEVICE_LOCK_SECRET}`)
    .digest('hex')
    .slice(0, 32);
}
