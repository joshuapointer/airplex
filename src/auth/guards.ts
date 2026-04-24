import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { env } from '@/lib/env';
import { getAdminSession, type AdminSessionData } from '@/lib/session';
import { ironConfigFor, type DeviceLockCookiePayload } from '@/lib/device-lock';
import { getShareById, computeShareStatus } from '@/db/queries/shares';
import type { ShareRow } from '@/types/share';

/**
 * Gate a route/RSC on an authenticated admin session. Throws a
 * `NextResponse` (302 to `/login` on missing session, 403 JSON on group
 * mismatch) so callers can `throw await requireAdmin()` — Next's error
 * boundary propagates the Response.
 *
 * `returnTo` is an explicit argument because RSC/route-handler code cannot
 * uniformly discover the current path; the caller (middleware or login link)
 * is responsible for threading it through.
 */
export async function requireAdmin(returnTo?: string): Promise<AdminSessionData> {
  const session = await getAdminSession();
  if (!session.sub) {
    const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    throw NextResponse.redirect(new URL(`/login${qs}`, env.APP_URL));
  }

  if (env.OIDC_ADMIN_GROUPS.length > 0) {
    const userGroups = session.groups ?? [];
    const allowed = env.OIDC_ADMIN_GROUPS.some((g) => userGroups.includes(g));
    if (!allowed) {
      throw NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  // Strip the iron-session save/destroy/updateConfig helpers from the return
  // type so callers don't accidentally mutate the cookie.
  return {
    sub: session.sub,
    email: session.email,
    name: session.name,
    groups: session.groups,
    issued_at: session.issued_at,
    csrf: session.csrf,
  };
}

/**
 * Gate a share-scoped request. Loads the row, checks status, and (if the
 * share is device-locked) verifies the per-link iron-session cookie.
 * Throws a `NextResponse` with the appropriate status on any failure.
 */
export async function requireShareAccess(req: Request, linkId: string): Promise<ShareRow> {
  const row = getShareById(linkId);
  if (!row) {
    throw NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const status = computeShareStatus(row);
  if (!status.active) {
    throw NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (row.device_fingerprint_hash) {
    const now = Math.floor(Date.now() / 1000);
    // Null expires_at = never-expires share; cap the cookie at 30d so the
    // session cookie still rotates periodically.
    const ttlSeconds = row.expires_at === null ? 30 * 86400 : Math.max(60, row.expires_at - now);
    const cookieStore = await cookies();
    const deviceSession = await getIronSession<DeviceLockCookiePayload>(
      cookieStore,
      ironConfigFor(linkId, ttlSeconds),
    );
    if (!deviceSession.device_fp || deviceSession.device_fp !== row.device_fingerprint_hash) {
      // `req` is accepted for signature parity with the plan (§A.9) and
      // future use (e.g. IP-based logging); not consumed here.
      void req;
      throw NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  return row;
}
