// src/app/api/hls/[link_id]/metadata/route.ts
//
// Rich metadata endpoint for the player-page side panel. Source: Plex
// (primary) + optional TMDB (fallback for missing fields). Auth: share
// access (device-lock cookie required once claimed).
//
// Scope guard: when `?rk=<ratingKey>` is supplied, the recipient MUST NOT
// be able to read arbitrary Plex metadata outside the share's scope.
// Enforced by requiring a numeric key AND (for show shares) verifying the
// rk is a descendant of the share's root via Plex's own ancestor fields
// (`parentRatingKey` for seasons, `grandparentRatingKey` for episodes).
// Movies/episodes ignore `?rk=` entirely.

import { NextResponse } from 'next/server';

import { requireShareAccess } from '@/auth/guards';
import { buildPlayerMetadata, type PlayerMetadata } from '@/lib/player-metadata';
import { logger } from '@/lib/logger';
import { isDescendantOfShow } from '@/lib/scope-guard';
import { findMovie, findTv, tmdbEnabled, type TmdbMetadata } from '@/lib/tmdb';
import { getMetadata } from '@/plex/metadata';
import type { PlexMetadata } from '@/types/plex';
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
  if (!guarded || typeof guarded !== 'object' || !('id' in guarded)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const row = guarded as ShareRow;

  const url = new URL(request.url);
  const rkParam = url.searchParams.get('rk');

  let ratingKey = row.plex_rating_key;
  if (rkParam !== null && rkParam.length > 0 && rkParam !== row.plex_rating_key) {
    // Strict numeric guard — blocks injection into the Plex path and
    // neutralises log-forging via the error path below.
    if (!/^\d+$/.test(rkParam)) {
      return NextResponse.json({ error: 'invalid_rk' }, { status: 400 });
    }
    if (row.plex_media_type !== 'show') {
      // Only show-scoped shares may override rk (to traverse seasons /
      // episodes of the same show). Movie & episode shares are fixed to
      // their `plex_rating_key`.
      return NextResponse.json({ error: 'rk_override_requires_show' }, { status: 400 });
    }
    ratingKey = rkParam;
  }

  let plex: PlexMetadata;
  try {
    plex = await getMetadata(ratingKey);
  } catch (err) {
    logger.warn({ err, linkId: row.id }, 'plex metadata fetch failed');
    return NextResponse.json({ error: 'plex_error' }, { status: 502 });
  }

  // Post-fetch scope enforcement: the rk must actually resolve to a node
  // beneath the share's root (or be the root itself). Uses Plex's own
  // ancestry fields — no extra round-trip, just a value check on the
  // metadata we already have.
  if (ratingKey !== row.plex_rating_key) {
    if (!isDescendantOfShow(plex, row.plex_rating_key)) {
      return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
    }
  }

  // TMDB lookup strategy:
  //   - movie → /search/movie by title+year
  //   - episode → /search/tv by grandparent (show) title+parentYear fallback
  //   - show → /search/tv by title
  let tmdb: TmdbMetadata | null = null;
  if (tmdbEnabled()) {
    try {
      if (plex.type === 'movie') {
        tmdb = await findMovie(plex.title, plex.year ?? null);
      } else if (plex.type === 'episode') {
        const showTitle = plex.grandparentTitle ?? plex.title;
        tmdb = await findTv(showTitle, plex.parentYear ?? plex.year ?? null);
      } else if (plex.type === 'show') {
        tmdb = await findTv(plex.title, plex.year ?? null);
      }
    } catch (err) {
      logger.debug({ err }, 'tmdb lookup failed, falling back to plex-only');
      tmdb = null;
    }
  }

  const dto: PlayerMetadata = buildPlayerMetadata({ linkId: row.id, plex, tmdb });

  return NextResponse.json(dto, {
    headers: {
      'Cache-Control': 'private, max-age=60',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
