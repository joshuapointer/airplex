import { NextResponse } from 'next/server';
import { requireShareAccess } from '@/auth/guards';
import { getChildren, getMetadata } from '@/plex/metadata';
import type { ShareRow } from '@/types/share';
import type { PlexMetadata } from '@/types/plex';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface EpisodeLite {
  ratingKey: string;
  index: number | null;
  title: string;
  summary: string | null;
  durationMs: number | null;
  thumb: string | null;
}

interface SeasonLite {
  ratingKey: string;
  index: number | null;
  title: string;
  episodeCount: number | null;
  episodes: EpisodeLite[];
}

function pickNumber(n: number | undefined | null): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function toEpisode(m: PlexMetadata): EpisodeLite {
  return {
    ratingKey: String(m.ratingKey),
    index: pickNumber(m.index),
    title: m.title ?? `Episode ${m.index ?? ''}`.trim(),
    summary: m.summary ?? null,
    durationMs: pickNumber(m.duration),
    thumb: m.thumb ?? null,
  };
}

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

  if (row.plex_media_type !== 'show') {
    return NextResponse.json({ error: 'not_a_show' }, { status: 400 });
  }

  let show: PlexMetadata;
  try {
    show = await getMetadata(row.plex_rating_key);
  } catch {
    return NextResponse.json({ error: 'plex_error' }, { status: 502 });
  }

  let seasons: PlexMetadata[];
  try {
    seasons = await getChildren(row.plex_rating_key);
  } catch {
    return NextResponse.json({ error: 'plex_error' }, { status: 502 });
  }

  // Fetch episodes for each season in parallel. Plex's /children on a season
  // returns episodes; on a show returns seasons.
  const withEpisodes: SeasonLite[] = await Promise.all(
    seasons.map(async (s) => {
      let eps: PlexMetadata[] = [];
      try {
        eps = await getChildren(String(s.ratingKey));
      } catch {
        eps = [];
      }
      return {
        ratingKey: String(s.ratingKey),
        index: pickNumber(s.index),
        title: s.title ?? `Season ${s.index ?? ''}`.trim(),
        episodeCount: pickNumber(s.leafCount),
        episodes: eps.map(toEpisode),
      };
    }),
  );

  return NextResponse.json({
    show: {
      ratingKey: String(show.ratingKey),
      title: show.title ?? row.title,
      summary: show.summary ?? null,
      art: show.art ?? null,
      thumb: show.thumb ?? null,
    },
    seasons: withEpisodes,
  });
}
