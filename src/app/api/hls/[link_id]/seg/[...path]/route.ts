import { NextResponse } from 'next/server';
import { requireShareAccess } from '@/auth/guards';
import { decodeSegmentBlob, rewriteManifest } from '@/plex/hls-rewriter';
import { plexFetch, PlexError } from '@/plex/client';
import { getPlexBaseUrl } from '@/plex/config';
import { logger } from '@/lib/logger';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ link_id: string; path?: string[] }> },
): Promise<NextResponse | Response> {
  const { link_id: linkId, path } = await context.params;

  const guarded: ShareRow | unknown = await requireShareAccess(request, linkId).catch(
    (r: unknown) => r,
  );
  if (guarded instanceof NextResponse) return guarded;
  if (!guarded || typeof guarded !== 'object' || !('id' in guarded)) {
    const cause =
      guarded instanceof Error ? guarded : new Error('hls seg: guard rejected with non-Error');
    logger.error({ err: cause }, 'unexpected guard rejection');
    throw cause;
  }
  const row = guarded as ShareRow;

  const blob = path?.[0];
  if (!blob) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let originalPath: string;
  try {
    originalPath = decodeSegmentBlob(blob, row.id);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let response: Response;
  try {
    response = await plexFetch({ path: originalPath, stream: true });
  } catch (err) {
    const status = err instanceof PlexError ? err.status : 502;
    return NextResponse.json({ error: 'plex_error', status }, { status: 502 });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return new NextResponse(body, { status: response.status });
  }

  const upstreamType = response.headers.get('content-type') ?? 'application/octet-stream';

  // Nested m3u8 playlists inside a master playlist also contain URIs
  // (segment .ts files, keys, etc.) that must be rewritten so they still
  // route back through this proxy. Without this, the player requests
  // `/api/hls/<id>/seg/00001.ts` literally and we 404 on decode.
  if (upstreamType.includes('mpegurl') || originalPath.endsWith('.m3u8')) {
    const plexBaseUrl = getPlexBaseUrl();
    if (!plexBaseUrl) {
      return NextResponse.json({ error: 'plex_not_configured' }, { status: 503 });
    }
    const text = await response.text();
    // Nested playlists may contain purely relative URIs (e.g. `00001.ts`);
    // the rewriter needs the containing directory to resolve them correctly.
    const dir = originalPath.slice(0, originalPath.lastIndexOf('/') + 1);
    const normalized = text
      .split(/\r?\n/)
      .map((line) => {
        if (line.length === 0 || line.startsWith('#')) return line;
        // Absolute already — rewriter handles.
        if (/^https?:\/\//i.test(line) || line.startsWith('/')) return line;
        return dir + line;
      })
      .join('\n');
    const { manifest } = rewriteManifest({
      manifest: normalized,
      linkId: row.id,
      plexBaseUrl,
    });
    return new NextResponse(manifest, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, max-age=1',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }

  // Only forward Content-Length when Plex provides it; an empty string is
  // malformed (RFC 7230) and causes some HLS clients to treat the segment as
  // zero-length and stall playback.
  const responseHeaders: Record<string, string> = {
    'Content-Type': upstreamType,
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, max-age=60',
  };
  const contentLength = response.headers.get('content-length');
  if (contentLength) responseHeaders['Content-Length'] = contentLength;

  return new NextResponse(response.body, { status: 200, headers: responseHeaders });
}
