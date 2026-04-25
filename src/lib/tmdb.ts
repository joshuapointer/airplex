// src/lib/tmdb.ts
//
// Optional TMDB v3 metadata fallback. Used when Plex returns sparse
// fields (missing cast, ratings, backdrop). Read-only, server-only.
// If TMDB_API_KEY is absent, all helpers return null — callers get
// Plex-only data and the UI degrades gracefully.

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

export interface TmdbPerson {
  name: string;
  character?: string;
  profilePath?: string | null;
}

export interface TmdbMetadata {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  tagline?: string | null;
  overview?: string | null;
  year?: number | null;
  releaseDate?: string | null;
  runtimeMs?: number | null;
  genres: string[];
  cast: TmdbPerson[];
  directors: string[];
  writers: string[];
  voteAverage?: number | null;
  voteCount?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  imdbId?: string | null;
  homepage?: string | null;
}

function isEnabled(): boolean {
  return env.TMDB_API_KEY.length > 0;
}

export function tmdbEnabled(): boolean {
  return isEnabled();
}

function imgUrl(
  path: string | null | undefined,
  size: 'w500' | 'w342' | 'w185' | 'original',
): string | null {
  if (!path) return null;
  return `${TMDB_IMG}/${size}${path}`;
}

async function tmdbFetch<T>(
  path: string,
  query: Record<string, string | number> = {},
): Promise<T | null> {
  if (!isEnabled()) return null;
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      // Cache lookups aggressively; metadata is stable.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      logger.debug({ tmdb: { status: res.status, path } }, 'tmdb non-ok');
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.debug({ tmdb: { err: String(err), path } }, 'tmdb fetch failed');
    return null;
  }
}

interface TmdbSearchItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  media_type?: 'movie' | 'tv' | 'person';
}

interface TmdbSearchResp {
  results: TmdbSearchItem[];
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  tagline?: string;
  overview?: string;
  release_date?: string;
  runtime?: number;
  genres?: { id: number; name: string }[];
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  imdb_id?: string | null;
  homepage?: string | null;
  credits?: {
    cast?: { name: string; character?: string; profile_path?: string | null; order?: number }[];
    crew?: { name: string; job?: string; department?: string }[];
  };
}

interface TmdbTvDetails {
  id: number;
  name: string;
  tagline?: string;
  overview?: string;
  first_air_date?: string;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  homepage?: string | null;
  external_ids?: { imdb_id?: string | null };
  credits?: {
    cast?: { name: string; character?: string; profile_path?: string | null; order?: number }[];
    crew?: { name: string; job?: string; department?: string }[];
  };
  created_by?: { name: string }[];
}

function parseYear(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const y = parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

async function searchTitle(
  kind: 'movie' | 'tv',
  title: string,
  year: number | null,
): Promise<number | null> {
  const query: Record<string, string | number> = { query: title };
  if (year) {
    query[kind === 'movie' ? 'year' : 'first_air_date_year'] = year;
  }
  const resp = await tmdbFetch<TmdbSearchResp>(`/search/${kind}`, query);
  const first = resp?.results?.[0];
  return first?.id ?? null;
}

export async function findMovie(title: string, year?: number | null): Promise<TmdbMetadata | null> {
  if (!isEnabled()) return null;
  const id = await searchTitle('movie', title, year ?? null);
  if (!id) return null;
  const d = await tmdbFetch<TmdbMovieDetails>(`/movie/${id}`, { append_to_response: 'credits' });
  if (!d) return null;

  const directors = d.credits?.crew?.filter((c) => c.job === 'Director').map((c) => c.name) ?? [];
  const writers =
    d.credits?.crew
      ?.filter((c) => c.department === 'Writing' || c.job === 'Screenplay' || c.job === 'Writer')
      .map((c) => c.name) ?? [];
  const cast =
    d.credits?.cast
      ?.slice()
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, 15)
      .map((c) => ({
        name: c.name,
        character: c.character ?? undefined,
        profilePath: imgUrl(c.profile_path, 'w185'),
      })) ?? [];

  return {
    tmdbId: d.id,
    mediaType: 'movie',
    title: d.title,
    tagline: d.tagline ?? null,
    overview: d.overview ?? null,
    year: parseYear(d.release_date),
    releaseDate: d.release_date ?? null,
    runtimeMs: d.runtime ? d.runtime * 60_000 : null,
    genres: d.genres?.map((g) => g.name) ?? [],
    cast,
    directors,
    writers: Array.from(new Set(writers)),
    voteAverage: d.vote_average ?? null,
    voteCount: d.vote_count ?? null,
    posterUrl: imgUrl(d.poster_path, 'w500'),
    backdropUrl: imgUrl(d.backdrop_path, 'original'),
    imdbId: d.imdb_id ?? null,
    homepage: d.homepage ?? null,
  };
}

export async function findTv(title: string, year?: number | null): Promise<TmdbMetadata | null> {
  if (!isEnabled()) return null;
  const id = await searchTitle('tv', title, year ?? null);
  if (!id) return null;
  const d = await tmdbFetch<TmdbTvDetails>(`/tv/${id}`, {
    append_to_response: 'credits,external_ids',
  });
  if (!d) return null;

  const directors = d.credits?.crew?.filter((c) => c.job === 'Director').map((c) => c.name) ?? [];
  const writers = d.created_by?.map((p) => p.name) ?? [];
  const cast =
    d.credits?.cast
      ?.slice()
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, 15)
      .map((c) => ({
        name: c.name,
        character: c.character ?? undefined,
        profilePath: imgUrl(c.profile_path, 'w185'),
      })) ?? [];

  const runtimeMs =
    d.episode_run_time && d.episode_run_time.length > 0
      ? d.episode_run_time[0]! * 60_000
      : null;

  return {
    tmdbId: d.id,
    mediaType: 'tv',
    title: d.name,
    tagline: d.tagline ?? null,
    overview: d.overview ?? null,
    year: parseYear(d.first_air_date),
    releaseDate: d.first_air_date ?? null,
    runtimeMs,
    genres: d.genres?.map((g) => g.name) ?? [],
    cast,
    directors,
    writers,
    voteAverage: d.vote_average ?? null,
    voteCount: d.vote_count ?? null,
    posterUrl: imgUrl(d.poster_path, 'w500'),
    backdropUrl: imgUrl(d.backdrop_path, 'original'),
    imdbId: d.external_ids?.imdb_id ?? null,
    homepage: d.homepage ?? null,
  };
}
