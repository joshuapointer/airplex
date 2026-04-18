// src/plex/client.ts
//
// Plex HTTP client. Owns the ONLY read of env.PLEX_TOKEN outside env.ts
// (see plan §F item 5). Injects auth headers on every outgoing request.
// Never logs the token, never includes it in the URL.

import { env } from '@/lib/env';
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

function buildUrl(path: string, query?: Record<string, string | number>): string {
  const base = env.PLEX_BASE_URL;
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
  const url = buildUrl(opts.path, opts.query);

  const headers: Record<string, string> = {
    'X-Plex-Token': env.PLEX_TOKEN,
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
