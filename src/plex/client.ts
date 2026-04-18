// src/plex/client.ts
//
// Plex HTTP client. Token and base URL are sourced from the runtime
// configuration layer (`@/plex/config`), which reads from the `settings`
// table populated by the /setup/plex PIN OAuth flow and falls back to env
// for compose-based deployments. Injects auth headers on every outgoing
// request; never logs the token, never includes it in the URL.

import { env } from '@/lib/env';
import { getPlexBaseUrl, getPlexToken } from '@/plex/config';
import { logger } from '@/lib/logger';

export interface PlexRequestOptions {
  path: string; // e.g. '/library/sections'
  query?: Record<string, string | number>;
  method?: 'GET' | 'DELETE' | 'POST';
  accept?: 'json' | 'xml' | 'm3u8';
  stream?: boolean; // if true, return Response unread (for segment proxy)
}

const ACCEPT_HEADERS: Record<NonNullable<PlexRequestOptions['accept']>, string> = {
  json: 'application/json',
  xml: 'application/xml',
  m3u8: 'application/vnd.apple.mpegurl',
};

export class PlexError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message?: string) {
    super(message ?? `Plex request failed: ${status} ${path}`);
    this.name = 'PlexError';
    this.status = status;
    this.path = path;
  }
}

function buildUrl(base: string, path: string, query?: Record<string, string | number>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function plexFetch(opts: PlexRequestOptions): Promise<Response> {
  const method = opts.method ?? 'GET';
  const acceptKey: NonNullable<PlexRequestOptions['accept']> = opts.accept ?? 'json';

  const token = getPlexToken();
  const baseUrl = getPlexBaseUrl();
  if (!token || !baseUrl) {
    throw new PlexError(503, opts.path, 'Plex not configured — complete setup at /setup/plex');
  }

  const url = buildUrl(baseUrl, opts.path, opts.query);

  const headers: Record<string, string> = {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': env.PLEX_CLIENT_IDENTIFIER,
    Accept: ACCEPT_HEADERS[acceptKey],
  };

  // Log path + method only. NEVER log headers (would leak token).
  logger.debug({ plex: { method, path: opts.path } }, 'plex request');

  const res = await fetch(url, { method, headers });

  if (!res.ok) {
    // Consume body to free the socket but don't include it in the error message
    // (may contain noisy XML). Path is safe — it doesn't carry the token.
    try {
      await res.text();
    } catch {
      /* ignore */
    }
    throw new PlexError(res.status, opts.path);
  }

  return res;
}

export async function plexJson<T>(opts: PlexRequestOptions): Promise<T> {
  const res = await plexFetch({ ...opts, accept: opts.accept ?? 'json', stream: false });
  return (await res.json()) as T;
}
