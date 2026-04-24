// src/lib/player-metadata.ts
//
// DTO for the player-page side panel. Merges Plex metadata (primary) with
// optional TMDB metadata (fallback) into a single flat shape the UI renders.

import { encodeSegmentBlob } from '@/plex/hls-rewriter';
import type { PlexMetadata } from '@/types/plex';
import type { TmdbMetadata } from '@/lib/tmdb';

export interface CastMember {
  name: string;
  role: string | null;
  thumbUrl: string | null;
}

export interface PlayerMetadata {
  kind: 'movie' | 'episode' | 'show';
  ratingKey: string;
  title: string;
  year: number | null;
  tagline: string | null;
  summary: string | null;
  contentRating: string | null;
  durationMs: number | null;
  originallyAvailableAt: string | null;
  studio: string | null;
  ratings: {
    plex: number | null;
    audience: number | null;
    tmdb: number | null;
  };
  genres: string[];
  directors: string[];
  writers: string[];
  cast: CastMember[];
  posterUrl: string | null;
  backdropUrl: string | null;
  show: { title: string; year: number | null; ratingKey: string | null } | null;
  seasonIndex: number | null;
  seasonTitle: string | null;
  episodeIndex: number | null;
  imdbId: string | null;
  tmdbId: number | null;
  sources: { plex: true; tmdb: boolean };
}

function plexImgUrl(plexPath: string | null | undefined, linkId: string): string | null {
  if (!plexPath) return null;
  if (!plexPath.startsWith('/')) return null;
  try {
    const blob = encodeSegmentBlob(plexPath, linkId);
    return `/api/hls/${linkId}/img/${blob}`;
  } catch {
    return null;
  }
}

function firstNonEmpty<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) {
    if (v !== null && v !== undefined && (typeof v !== 'string' || v.length > 0)) {
      return v;
    }
  }
  return null;
}

function tagNames(tags: { tag: string }[] | undefined): string[] {
  return (
    tags?.map((t) => t.tag).filter((s): s is string => typeof s === 'string' && s.length > 0) ?? []
  );
}

/**
 * Build the player-page DTO from Plex (required) and TMDB (optional). TMDB
 * is used to backfill empty Plex fields only — it never overwrites values
 * the Plex library already has. Images prefer Plex (proxied, token-free);
 * TMDB backdrop/poster used only when Plex has none.
 *
 * Cast policy is intentionally all-or-nothing: if Plex has ANY cast entries,
 * we show only those (no merge with TMDB). Rationale — Plex's Role tags are
 * curated by the library owner and ordered by relevance; interleaving with
 * TMDB's (larger) full cast list produces near-duplicate entries with
 * different characterizations and inconsistent ordering. TMDB cast is used
 * strictly as a fallback when Plex lacks any Role data.
 */
export function buildPlayerMetadata(args: {
  linkId: string;
  plex: PlexMetadata;
  tmdb: TmdbMetadata | null;
}): PlayerMetadata {
  const { linkId, plex, tmdb } = args;

  const kind: PlayerMetadata['kind'] =
    plex.type === 'episode' ? 'episode' : plex.type === 'show' ? 'show' : 'movie';

  const posterPlex = plexImgUrl(plex.thumb, linkId);
  const backdropPlex = plexImgUrl(plex.art, linkId);

  const castPlex: CastMember[] =
    plex.Role?.slice(0, 15).map((r) => ({
      name: r.tag,
      role: r.role ?? null,
      thumbUrl: plexImgUrl(r.thumb, linkId),
    })) ?? [];

  const castTmdb: CastMember[] =
    tmdb?.cast.map((c) => ({
      name: c.name,
      role: c.character ?? null,
      thumbUrl: c.profilePath ?? null,
    })) ?? [];

  const cast = castPlex.length > 0 ? castPlex : castTmdb;

  const genres = tagNames(plex.Genre).length > 0 ? tagNames(plex.Genre) : (tmdb?.genres ?? []);
  const directors =
    tagNames(plex.Director).length > 0 ? tagNames(plex.Director) : (tmdb?.directors ?? []);
  const writers = tagNames(plex.Writer).length > 0 ? tagNames(plex.Writer) : (tmdb?.writers ?? []);

  const show: PlayerMetadata['show'] =
    kind === 'episode'
      ? {
          title: plex.grandparentTitle ?? tmdb?.title ?? '',
          year: firstNonEmpty(plex.parentYear, tmdb?.year ?? null),
          ratingKey: plex.grandparentRatingKey ?? null,
        }
      : null;

  return {
    kind,
    ratingKey: String(plex.ratingKey),
    title: plex.title,
    year: firstNonEmpty(plex.year, tmdb?.year ?? null),
    tagline: firstNonEmpty(plex.tagline, tmdb?.tagline ?? null),
    summary: firstNonEmpty(plex.summary, tmdb?.overview ?? null),
    contentRating: plex.contentRating ?? null,
    durationMs: firstNonEmpty(plex.duration ?? null, tmdb?.runtimeMs ?? null),
    originallyAvailableAt: firstNonEmpty(plex.originallyAvailableAt, tmdb?.releaseDate ?? null),
    studio: plex.studio ?? null,
    ratings: {
      plex: typeof plex.rating === 'number' ? plex.rating : null,
      audience: typeof plex.audienceRating === 'number' ? plex.audienceRating : null,
      tmdb: tmdb?.voteAverage ?? null,
    },
    genres,
    directors,
    writers,
    cast,
    posterUrl: posterPlex ?? tmdb?.posterUrl ?? null,
    backdropUrl: backdropPlex ?? tmdb?.backdropUrl ?? null,
    show,
    seasonIndex: plex.parentIndex ?? null,
    seasonTitle: plex.parentTitle ?? null,
    episodeIndex: kind === 'episode' ? (plex.index ?? null) : null,
    imdbId: tmdb?.imdbId ?? null,
    tmdbId: tmdb?.tmdbId ?? null,
    sources: { plex: true, tmdb: tmdb !== null },
  };
}
