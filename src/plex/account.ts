// src/plex/account.ts
//
// Plex.tv account API helpers for the PIN-based OAuth flow. These talk to
// plex.tv directly (NOT the media server) to obtain an account auth token
// and discover the user's servers. The media server itself is still
// proxied through `src/plex/client.ts`.

const PLEX_TV = 'https://plex.tv';

export interface PlexPin {
  id: number;
  code: string;
}

export interface PlexConnection {
  uri: string;
  local: boolean;
  relay: boolean;
  https: boolean;
}

export interface PlexResource {
  name: string;
  product: string;
  owned: boolean;
  connections: PlexConnection[];
}

interface PinResponse {
  id: number;
  code: string;
  authToken: string | null;
}

interface RawConnection {
  uri: string;
  local: boolean;
  relay: boolean;
  protocol?: string;
}

interface RawResource {
  name: string;
  product: string;
  owned: boolean;
  connections?: RawConnection[];
}

/**
 * Create a "strong" Plex PIN. The pin code is shown to the user as part of
 * the plex.tv/auth redirect; `id` is used to later poll for the auth token.
 */
export async function createPin(clientId: string): Promise<PlexPin> {
  const res = await fetch(`${PLEX_TV}/api/v2/pins`, {
    method: 'POST',
    headers: {
      strong: 'true',
      'X-Plex-Product': 'airplex',
      'X-Plex-Client-Identifier': clientId,
      Accept: 'application/json',
      'Content-Length': '0',
    },
  });
  if (!res.ok) {
    throw new Error(`plex.tv pin creation failed: ${res.status}`);
  }
  const json = (await res.json()) as PinResponse;
  return { id: json.id, code: json.code };
}

/**
 * Poll Plex for the auth token bound to a PIN. Returns null if the user
 * has not yet completed the auth flow.
 */
export async function checkPin(
  pinId: number,
  pinCode: string,
  clientId: string,
): Promise<string | null> {
  const url = new URL(`${PLEX_TV}/api/v2/pins/${pinId}`);
  url.searchParams.set('code', pinCode);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Plex-Client-Identifier': clientId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`plex.tv pin check failed: ${res.status}`);
  }
  const json = (await res.json()) as PinResponse;
  return json.authToken && json.authToken.length > 0 ? json.authToken : null;
}

/**
 * List the resources (servers + clients) attached to the authenticated
 * Plex account. Filters to Plex Media Server products only.
 */
export async function listResources(authToken: string, clientId: string): Promise<PlexResource[]> {
  const url = new URL(`${PLEX_TV}/api/v2/resources`);
  url.searchParams.set('includeHttps', '1');
  url.searchParams.set('includeRelay', '1');
  url.searchParams.set('includeIPv6', '1');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Plex-Token': authToken,
      'X-Plex-Client-Identifier': clientId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`plex.tv resource list failed: ${res.status}`);
  }
  const raw = (await res.json()) as RawResource[];
  return raw
    .filter((r) => r.product === 'Plex Media Server')
    .map((r) => ({
      name: r.name,
      product: r.product,
      owned: r.owned,
      connections: (r.connections ?? []).map((c) => ({
        uri: c.uri,
        local: c.local,
        relay: c.relay,
        https: c.uri.startsWith('https://') || c.protocol === 'https',
      })),
    }));
}

/**
 * Build the plex.tv auth redirect URL. Uses fragment-based params (`#?`)
 * per the plex.tv sign-in spec.
 */
export function buildAuthUrl(pinCode: string, clientId: string, forwardUrl: string): string {
  const params = [
    `clientID=${encodeURIComponent(clientId)}`,
    `code=${encodeURIComponent(pinCode)}`,
    `context[device][product]=airplex`,
    `forwardUrl=${encodeURIComponent(forwardUrl)}`,
  ].join('&');
  return `https://app.plex.tv/auth#?${params}`;
}
