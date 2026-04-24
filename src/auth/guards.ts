import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { getAdminSession, type AdminSessionData } from '@/lib/session';
import { computeDeviceFp } from '@/lib/device-lock';
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
 * share is already claimed) verifies the request's recomputed device
 * fingerprint matches the stored hash. The fingerprint is derived from the
 * current User-Agent + Accept-Language + DEVICE_LOCK_SECRET — there is no
 * session cookie. A browser whose UA string changes (e.g. after a software
 * update) will fail the check; admin can reset from the dashboard.
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
    // Prefer the Request's own headers (available in Route Handlers) and
    // fall back to next/headers for Server Components / Server Actions
    // that forward an empty synthetic Request.
    let ua = req.headers.get('user-agent') ?? '';
    let acceptLang = req.headers.get('accept-language') ?? '';
    if (ua.length === 0 && acceptLang.length === 0) {
      const h = await headers();
      ua = h.get('user-agent') ?? '';
      acceptLang = h.get('accept-language') ?? '';
    }
    const fp = computeDeviceFp(ua, acceptLang);
    if (fp !== row.device_fingerprint_hash) {
      throw NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  return row;
}
