// src/app/api/admin/plex/thumb/route.ts
//
// Plex thumb proxy for admin UI (NewShareForm step-2 poster tiles).
// - Gate: requireAdmin().
// - Rate-limit: 120/min per admin (2 tokens/sec refill).
// - Path validation: only /library/metadata/* or /library/parts/* (≤256 chars,
//   no `..`, no scheme, no CRLF). Plan §D.2.
// - Streams bytes back; `X-Plex-Token` is injected as a request header by
//   plexFetch and never makes it into the response.

import { NextResponse } from 'next/server';

import { requireAdmin } from '@/auth/guards';
import { rateLimit } from '@/lib/ratelimit';
import { plexFetch, PlexError } from '@/plex/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function validatePlexThumbPath(path: string | null): string | null {
  if (!path || typeof path !== 'string') return null;
  if (path.length === 0 || path.length > 256) return null;
  if (!(path.startsWith('/library/metadata/') || path.startsWith('/library/parts/'))) return null;
  if (path.includes('..')) return null;
  if (path.includes('://')) return null;
  if (/\r|\n|%0a|%0d|%0A|%0D/.test(path)) return null;
  return path;
}

export async function GET(request: Request): Promise<NextResponse | Response> {
  let session;
  try {
    session = await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  if (!rateLimit(`plex-thumb:${session.sub}`, 120, 2)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const url = new URL(request.url);
  const path = validatePlexThumbPath(url.searchParams.get('path'));
  if (!path) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await plexFetch({ path, stream: true });
  } catch (err) {
    const plexStatus = err instanceof PlexError ? err.status : 502;
    return NextResponse.json({ error: 'plex_error', status: plexStatus }, { status: 404 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Content-Type allowlist: only forward known-safe image types so a
  // misconfigured Plex server can't make the browser interpret arbitrary
  // bytes (e.g. an HTML error page) as an image.
  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const rawType = upstream.headers.get('content-type') ?? '';
  const bareType = rawType.split(';')[0].trim().toLowerCase();
  const contentType = ALLOWED_IMAGE_TYPES.has(bareType) ? bareType : 'image/jpeg';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=300',
    'Referrer-Policy': 'no-referrer',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
