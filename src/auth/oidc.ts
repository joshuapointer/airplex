import { Issuer, generators, type Client } from 'openid-client';
import { env } from '@/lib/env';
import { issueCsrf } from '@/lib/csrf';
import type { AdminSessionData } from '@/lib/session';

/**
 * Short-lived state carried through the OIDC authorization-code + PKCE flow.
 * Persisted by the login route handler (C8) in the `airplex_oidc` iron-session
 * cookie (5-minute TTL) and re-read on the callback.
 */
export interface OidcLoginState {
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo?: string;
}

// Lazily-resolved singleton client. OIDC discovery is one network round-trip
// per process; caching is critical for callback latency but MUST NOT happen
// at module load (env may not be populated in test harnesses).
let _client: Client | null = null;

async function getClient(): Promise<Client> {
  if (_client) return _client;
  const issuer = await Issuer.discover(env.OIDC_ISSUER_URL);
  _client = new issuer.Client({
    client_id: env.OIDC_CLIENT_ID,
    client_secret: env.OIDC_CLIENT_SECRET,
    redirect_uris: [env.OIDC_REDIRECT_URI],
    response_types: ['code'],
  });
  return _client;
}

/**
 * Build the authorization URL for an OIDC login. Caller stores the returned
 * `state` in a short-lived signed cookie and re-supplies it to
 * {@link handleCallback} after the IdP redirects back.
 */
export async function buildAuthorizationUrl(
  returnTo?: string,
): Promise<{ url: string; state: OidcLoginState }> {
  const client = await getClient();

  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();
  const nonce = generators.nonce();

  const url = client.authorizationUrl({
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return {
    url,
    state: { state, codeVerifier, nonce, returnTo },
  };
}

/**
 * Exchange the authorization-code callback params for tokens, fetch userinfo,
 * and produce an {@link AdminSessionData} payload ready to seal into the
 * admin session cookie. Throws on bad state/nonce/issuer (openid-client
 * validates all three internally).
 */
export async function handleCallback(
  params: URLSearchParams,
  state: OidcLoginState,
): Promise<AdminSessionData> {
  const client = await getClient();

  // openid-client expects a plain object, not a URLSearchParams instance.
  const callbackParams: Record<string, string> = {};
  for (const [k, v] of params.entries()) callbackParams[k] = v;

  const tokens = await client.callback(env.OIDC_REDIRECT_URI, callbackParams, {
    state: state.state,
    nonce: state.nonce,
    code_verifier: state.codeVerifier,
  });

  if (!tokens.access_token) {
    throw new Error('oidc callback: missing access_token');
  }

  const userinfo = await client.userinfo(tokens.access_token);

  const groupsClaim = userinfo[env.OIDC_GROUPS_CLAIM] as unknown;
  const groups = Array.isArray(groupsClaim)
    ? (groupsClaim.filter((g) => typeof g === 'string') as string[])
    : undefined;

  const sub = userinfo.sub;
  if (!sub) {
    throw new Error('oidc callback: userinfo missing sub');
  }

  return {
    sub,
    email: typeof userinfo.email === 'string' ? userinfo.email : undefined,
    name: typeof userinfo.name === 'string' ? userinfo.name : undefined,
    groups,
    issued_at: Math.floor(Date.now() / 1000),
    csrf: issueCsrf(),
  };
}
