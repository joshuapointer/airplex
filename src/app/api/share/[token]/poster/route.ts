// src/app/api/share/[token]/poster/route.ts
//
// Poster proxy for the unclaimed share screen.
//
// - Gate: share-token signature + token_hash lookup + active status.
//   Does NOT require a device-lock cookie (the unclaimed screen renders
//   before claim) and does NOT claim on its own.
// - Source: `shares.poster_path` snapshotted at share-create time. If null
//   or fetch fails, returns 404 so the UI falls back to the text-only layout.
// - Transport: bytes streamed from Plex. `X-Plex-Token` never reaches the
//   browser because `plexFetch()` owns the header injection and this route
//   does not forward any URL to the client.
// - Rate-limit: per-token token bucket (30/min) to bound scraping if a
//   token leaks. `/api/*` is outside the middleware `/s/*` bucket.

import { NextResponse } from 'next/server';

import { computeShareStatus, getShareByTokenHash } from '@/db/queries/shares';
import { rateLimit } from '@/lib/ratelimit';
import { hashShareToken, verifyShareTokenSignature } from '@/lib/share-token';
import { plexFetch, PlexError } from '@/plex/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POSTER_CAPACITY = 30;
const POSTER_REFILL_PER_SEC = 30 / 60;

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse | Response> {
  const { token } = await context.params;

  if (!verifyShareTokenSignature(token)) {
    return notFound();
  }

  if (!rateLimit(`poster:${token}`, POSTER_CAPACITY, POSTER_REFILL_PER_SEC)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const row = getShareByTokenHash(hashShareToken(token));
  if (!row) {
    return notFound();
  }

  const status = computeShareStatus(row);
  if (!status.active) {
    return notFound();
  }

  if (!row.poster_path) {
    return notFound();
  }

  let upstream: Response;
  try {
    upstream = await plexFetch({ path: row.poster_path, stream: true });
  } catch (err) {
    const plexStatus = err instanceof PlexError ? err.status : 502;
    // Graceful fallback — recipient screen hides the poster on non-200.
    return NextResponse.json({ error: 'plex_error', status: plexStatus }, { status: 404 });
  }

  if (!upstream.ok || !upstream.body) {
    return notFound();
  }

  const upstreamType = upstream.headers.get('content-type') ?? 'image/jpeg';
  const headers: Record<string, string> = {
    'Content-Type': upstreamType,
    'Cache-Control': 'private, max-age=3600',
    'Referrer-Policy': 'no-referrer',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
