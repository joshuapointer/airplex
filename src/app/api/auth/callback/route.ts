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
 *     empty/missing, redirect to /login?error=oidc_state_missing — never call
 *     openid-client without state.
 *  2. Exchange the code for tokens + userinfo via `handleCallback`.
 *  3. Destroy the short-lived oidc cookie.
 *  4. Open the admin session, copy the returned payload in, and save.
 *  5. Redirect to the stashed `returnTo` (same-origin validated at login) or
 *     `/dashboard`.
 *
 * All error cases redirect to /login?error=<code> so the user sees a friendly
 * message rather than a raw JSON response.
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
    return NextResponse.redirect(new URL('/login?error=oidc_state_missing', env.APP_URL));
  }

  const state: OidcLoginState = {
    state: oidcSession.state,
    codeVerifier: oidcSession.codeVerifier,
    nonce: oidcSession.nonce,
    returnTo: oidcSession.returnTo,
  };

  let adminData: Awaited<ReturnType<typeof handleCallback>>;
  try {
    adminData = await handleCallback(req.nextUrl.searchParams, state);
  } catch {
    // Destroy the oidc session so a stale cookie can't be replayed.
    oidcSession.destroy();
    return NextResponse.redirect(new URL('/login?error=oidc_callback_failed', env.APP_URL));
  }

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
