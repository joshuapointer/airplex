import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { env } from '@/lib/env';

/**
 * Admin session cookie payload. Source of truth: plan §A.4.
 *
 * Issued by `oidc.handleCallback()` after successful code exchange and set via
 * `iron-session` v8. The cookie is `httpOnly; sameSite=lax; path=/` and
 * `secure` unless `NODE_ENV=test` (Playwright drives flows over localhost).
 */
export interface AdminSessionData {
  sub: string; // OIDC sub claim
  email?: string;
  name?: string;
  groups?: string[];
  issued_at: number;
  csrf: string; // double-submit token, 32 hex
}

export const ADMIN_SESSION_COOKIE = 'airplex_session';

const FOURTEEN_DAYS_SECONDS = 14 * 86400;

export function adminIronConfig(): SessionOptions {
  return {
    password: env.SESSION_SECRET,
    cookieName: ADMIN_SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV !== 'test',
      sameSite: 'lax',
      path: '/',
      maxAge: FOURTEEN_DAYS_SECONDS,
    },
  };
}

/**
 * Read (or lazily create) the admin session bound to the current RSC/route
 * handler request. Next 15's `cookies()` is async, so callers must `await`.
 */
export async function getAdminSession(): Promise<IronSession<AdminSessionData>> {
  const cookieStore = await cookies();
  return getIronSession<AdminSessionData>(cookieStore, adminIronConfig());
}
