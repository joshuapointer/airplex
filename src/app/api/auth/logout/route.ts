import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/session';
import { env } from '@/lib/env';

/**
 * POST /api/auth/logout — destroy the admin session cookie and send the user
 * back to the marketing root. POST is preferred so that a CSRF-free GET cannot
 * sign an admin out via a crafted <img src> or similar.
 *
 * Local logout only — we do NOT hit the IdP's `end_session_endpoint`
 * (see plan §G, out-of-scope).
 */
async function doLogout(): Promise<NextResponse> {
  const admin = await getAdminSession();
  admin.destroy();
  return NextResponse.redirect(new URL('/', env.APP_URL));
}

export async function POST(): Promise<NextResponse> {
  return doLogout();
}
