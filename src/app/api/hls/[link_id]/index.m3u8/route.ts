import { NextResponse } from 'next/server';
import { requireShareAccess } from '@/auth/guards';
import { buildStartUrl } from '@/plex/transcode';
import { plexFetch, PlexError } from '@/plex/client';
import { getPlexBaseUrl } from '@/plex/config';
import { rewriteManifest } from '@/plex/hls-rewriter';
import { logEvent } from '@/db/queries/events';
import { logger } from '@/lib/logger';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ link_id: string }> },
): Promise<NextResponse> {
  const { link_id: linkId } = await context.params;

  const guarded: ShareRow | unknown = await requireShareAccess(request, linkId).catch(
    (r: unknown) => r,
  );
  if (guarded instanceof NextResponse) return guarded;
  if (
    !guarded ||
    typeof guarded !== 'object' ||
    !('id' in guarded) ||
    !('plex_rating_key' in guarded)
  ) {
    const cause =
      guarded instanceof Error ? guarded : new Error('hls manifest: guard rejected with non-Error');
    logger.error({ err: cause }, 'unexpected guard rejection');
    throw cause;
  }
  const row = guarded as ShareRow;

  // Per-episode override for shows. Share at show level carries
  // row.plex_rating_key = the series; the player passes ?rk=<episode> when
  // the recipient picks an episode. Strict numeric guard to prevent
  // injection into the Plex `path` param.
  const url = new URL(request.url);
  const rkParam = url.searchParams.get('rk');
  let ratingKey = row.plex_rating_key;
  if (rkParam) {
    if (!/^\d+$/.test(rkParam)) {
      return NextResponse.json({ error: 'invalid_rk' }, { status: 400 });
    }
    if (row.plex_media_type !== 'show') {
      return NextResponse.json({ error: 'rk_override_requires_show' }, { status: 400 });
    }
    ratingKey = rkParam;
  }

  const startUrl = buildStartUrl({
    ratingKey,
    linkId: row.id,
  });
  const parsed = new URL(startUrl);
  const pathAndQuery = parsed.pathname + parsed.search;

  let response: Response;
  try {
    response = await plexFetch({ path: pathAndQuery, accept: 'm3u8' });
  } catch (err) {
    const status = err instanceof PlexError ? err.status : 502;
    return NextResponse.json({ error: 'plex_error', status }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'plex_error', status: response.status }, { status: 502 });
  }

  const plexBaseUrl = getPlexBaseUrl();
  if (!plexBaseUrl) {
    return NextResponse.json({ error: 'plex_not_configured' }, { status: 503 });
  }

  const text = await response.text();
  const { manifest } = rewriteManifest({
    manifest: text,
    linkId: row.id,
    plexBaseUrl,
  });

  // play events are logged here for analytics (HLS session start).
  // play_count is incremented at claim time in the share page to avoid
  // multi-worker double-counting (spec §13, plan §G deferred items).
  try {
    logEvent({ share_id: row.id, kind: 'play' });
  } catch {
    // Best-effort; never fail the manifest fetch over bookkeeping.
  }

  return new NextResponse(manifest, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'private, max-age=1',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
