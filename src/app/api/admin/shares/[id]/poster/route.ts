// src/app/api/admin/shares/[id]/poster/route.ts
//
// Admin poster proxy — serves the poster image for any share (active or not).
//
// - Gate: admin session via requireAdmin(). No device-lock required.
// - Lookup: getShareById(id) — no active-status gate (admins can view posters
//   for expired/revoked shares).
// - Source: `shares.poster_path` snapshotted at share-create time. If null
//   or fetch fails, returns 404.
// - Transport: bytes streamed from Plex. X-Plex-Token never reaches the
//   browser; plexFetch() owns header injection.
// - No rate limiting — admin surface is already session-gated.

import { NextResponse } from 'next/server';

import { requireAdmin } from '@/auth/guards';
import { getShareById } from '@/db/queries/shares';
import { plexFetch, PlexError } from '@/plex/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  try {
    await requireAdmin();
  } catch (res) {
    if (res instanceof NextResponse) return res;
    throw res;
  }

  const { id } = await context.params;

  const row = getShareById(id);
  if (!row || !row.poster_path) {
    return notFound();
  }

  let upstream: Response;
  try {
    upstream = await plexFetch({ path: row.poster_path, stream: true });
  } catch (err) {
    const plexStatus = err instanceof PlexError ? err.status : 502;
    return NextResponse.json({ error: 'plex_error', status: plexStatus }, { status: 404 });
  }

  if (!upstream.ok || !upstream.body) {
    return notFound();
  }

  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const rawType = upstream.headers.get('content-type') ?? '';
  const bareType = (rawType.split(';')[0] ?? '').trim().toLowerCase();
  const contentType = ALLOWED_IMAGE_TYPES.has(bareType) ? bareType : 'image/jpeg';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=3600',
    'Referrer-Policy': 'no-referrer',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
