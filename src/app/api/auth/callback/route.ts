import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { handleCallback, type OidcLoginState } from '@/auth/oidc';
import { getAdminSession } from '@/lib/session';
import { env } from '@/lib/env';

/**
 * GET /api/auth/callback — completes the OIDC flow.
 *
 *  1. Pull the sealed login-state out of the `airplex_oidc` cookie; if it's
 *     empty/missing, respond 400 — never call openid-client without state.
 *  2. Exchange the code for tokens + userinfo via `handleCallback`.
 *  3. Destroy the short-lived oidc cookie.
 *  4. Open the admin session, copy the returned payload in, and save.
 *  5. Redirect to the stashed `returnTo` (same-origin validated at login) or
 *     `/dashboard`.
 */
export async function GET(req: NextRequest) {
  const oidcSession = await getIronSession<OidcLoginState>(await cookies(), {
    password: env.SESSION_SECRET,
    cookieName: 'airplex_oidc',
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV !== 'test',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    },
  });

  if (!oidcSession.state || !oidcSession.codeVerifier || !oidcSession.nonce) {
    return NextResponse.json({ error: 'oidc_state_missing' }, { status: 400 });
  }

  const state: OidcLoginState = {
    state: oidcSession.state,
    codeVerifier: oidcSession.codeVerifier,
    nonce: oidcSession.nonce,
    returnTo: oidcSession.returnTo,
  };

  const adminData = await handleCallback(req.nextUrl.searchParams, state);

  oidcSession.destroy();

  // Destroy any pre-existing admin session before issuing a new one to prevent
  // session fixation: the old sealed cookie (even if it contained no useful
  // claims) is invalidated and a fresh payload is sealed with the new identity.
  const existing = await getAdminSession();
  existing.destroy();

  const admin = await getAdminSession();
  admin.sub = adminData.sub;
  admin.email = adminData.email;
  admin.name = adminData.name;
  admin.groups = adminData.groups;
  admin.issued_at = adminData.issued_at;
  admin.csrf = adminData.csrf;
  await admin.save();

  // Defense-in-depth: re-validate returnTo even though it was validated at
  // login time. Must start with '/' and must not start with '//' (which would
  // be treated as a protocol-relative URL by some parsers).
  const rawTarget = state.returnTo;
  const target =
    typeof rawTarget === 'string' && rawTarget.startsWith('/') && !rawTarget.startsWith('//')
      ? rawTarget
      : '/dashboard';
  return NextResponse.redirect(new URL(target, env.APP_URL));
}
