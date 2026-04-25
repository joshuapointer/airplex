import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSession } from '@/lib/session';
import { verifyCsrf } from '@/lib/csrf';
import { env } from '@/lib/env';

/**
 * POST /api/auth/logout — destroy the admin session cookie and send the user
 * back to the marketing root. POST is preferred so that a CSRF-free GET cannot
 * sign an admin out via a crafted <img src> or similar.
 *
 * Local logout only — we do NOT hit the IdP's `end_session_endpoint`
 * (see plan §G, out-of-scope).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await getAdminSession();

  // Verify the CSRF token before destroying the session. Without this check a
  // cross-origin page could trigger logout via a form POST (login CSRF).
  if (!verifyCsrf(admin, req.headers.get('x-airplex-csrf'))) {
    return NextResponse.json({ error: 'csrf' }, { status: 403 });
  }

  admin.destroy();
  return NextResponse.redirect(new URL('/', env.APP_URL));
}
