import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { buildAuthorizationUrl, type OidcLoginState } from '@/auth/oidc';
import { env } from '@/lib/env';

/**
 * GET /api/auth/login — kicks off the OIDC authorization-code + PKCE flow.
 *
 *  1. Read & validate `?returnTo=` (must be a same-origin relative path).
 *  2. Ask openid-client for an authorization URL + the state tuple to stash.
 *  3. Seal the state into the short-lived `airplex_oidc` iron-session cookie
 *     (5-minute TTL, httpOnly, sameSite=lax). The callback consumes it.
 *  4. 302 the browser to the IdP.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('returnTo');
  const returnTo =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';

  const { url, state } = await buildAuthorizationUrl(returnTo);

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

  oidcSession.state = state.state;
  oidcSession.codeVerifier = state.codeVerifier;
  oidcSession.nonce = state.nonce;
  oidcSession.returnTo = state.returnTo;
  await oidcSession.save();

  return NextResponse.redirect(url);
}
