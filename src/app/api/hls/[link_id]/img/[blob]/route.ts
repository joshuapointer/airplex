// src/app/api/hls/[link_id]/img/[blob]/route.ts
//
// Plex image proxy for side-panel artwork (poster, backdrop, cast thumbs).
// The `blob` is produced by `encodeSegmentBlob(plexPath, linkId)` — same
// AES-256-GCM scheme as HLS segment proxying, so Plex paths are opaque,
// tamper-evident, and per-link.

import { NextResponse } from 'next/server';

import { requireShareAccess } from '@/auth/guards';
import { decodeSegmentBlob } from '@/plex/hls-rewriter';
import { plexFetch, PlexError } from '@/plex/client';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ link_id: string; blob: string }> },
): Promise<NextResponse | Response> {
  const { link_id: linkId, blob } = await context.params;

  const guarded: ShareRow | unknown = await requireShareAccess(request, linkId).catch(
    (r: unknown) => r,
  );
  if (guarded instanceof NextResponse) return guarded;
  if (!guarded || typeof guarded !== 'object' || !('id' in guarded)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const row = guarded as ShareRow;

  let plexPath: string;
  try {
    plexPath = decodeSegmentBlob(blob, row.id);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await plexFetch({ path: plexPath, stream: true });
  } catch (err) {
    // Forward the real upstream status (404, 403, 5xx) instead of flattening
    // to 404 — otherwise broken configs masquerade as "image missing".
    const status = err instanceof PlexError ? err.status : 502;
    return NextResponse.json({ error: 'plex_error' }, { status });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'plex_error' }, { status: upstream.status || 502 });
  }

  // Content-Type allowlist: Plex should only return image/* for these paths,
  // but a misconfigured server could respond with text/html (error page).
  // Pin to a known-safe allowlist so the browser can't interpret arbitrary
  // bytes as HTML.
  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const rawType = upstream.headers.get('content-type') ?? '';
  const bareType = (rawType.split(';')[0] ?? '').trim().toLowerCase();
  const contentType = ALLOWED_IMAGE_TYPES.has(bareType) ? bareType : 'image/jpeg';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=86400',
    'Referrer-Policy': 'no-referrer',
  };
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
