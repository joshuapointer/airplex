import { describe, it, expect } from 'vitest';

import { buildPlayerMetadata } from '@/lib/player-metadata';
import type { PlexMetadata } from '@/types/plex';
import type { TmdbMetadata } from '@/lib/tmdb';

const LINK_ID = 'link-abc';

function plexFixture(over: Partial<PlexMetadata> = {}): PlexMetadata {
  return {
    ratingKey: '12345',
    type: 'movie',
    title: 'Blade Runner',
    year: 1982,
    summary: 'A blade runner must pursue and terminate four replicants.',
    duration: 1000 * 60 * 117,
    contentRating: 'R',
    studio: 'Warner Bros.',
    rating: 8.1,
    audienceRating: 9.1,
    thumb: '/library/metadata/12345/thumb/1600000',
    art: '/library/metadata/12345/art/1600000',
    Genre: [{ tag: 'Sci-Fi' }, { tag: 'Neo-Noir' }],
    Director: [{ tag: 'Ridley Scott' }],
    Writer: [{ tag: 'Hampton Fancher' }, { tag: 'David Peoples' }],
    Role: [
      { tag: 'Harrison Ford', role: 'Deckard', thumb: '/library/metadata/12345/role/1' },
      { tag: 'Rutger Hauer', role: 'Roy Batty' },
    ],
    ...over,
  };
}

function tmdbFixture(over: Partial<TmdbMetadata> = {}): TmdbMetadata {
  return {
    tmdbId: 78,
    mediaType: 'movie',
    title: 'Blade Runner',
    overview: 'TMDB overview',
    year: 1982,
    releaseDate: '1982-06-25',
    runtimeMs: 1000 * 60 * 117,
    genres: ['Science Fiction', 'Thriller'],
    cast: [
      {
        name: 'Harrison Ford',
        character: 'Rick Deckard',
        profilePath: 'https://img.example/a.jpg',
      },
    ],
    directors: ['Ridley Scott'],
    writers: ['Hampton Fancher'],
    voteAverage: 8.1,
    voteCount: 14_000,
    posterUrl: 'https://img.example/poster.jpg',
    backdropUrl: 'https://img.example/backdrop.jpg',
    imdbId: 'tt0083658',
    homepage: null,
    tagline: 'Man has made his match... now it\u2019s his problem.',
    ...over,
  };
}

describe('buildPlayerMetadata', () => {
  it('uses plex data as primary source', () => {
    const dto = buildPlayerMetadata({ linkId: LINK_ID, plex: plexFixture(), tmdb: null });
    expect(dto.title).toBe('Blade Runner');
    expect(dto.year).toBe(1982);
    expect(dto.genres).toEqual(['Sci-Fi', 'Neo-Noir']);
    expect(dto.directors).toEqual(['Ridley Scott']);
    expect(dto.cast).toHaveLength(2);
    expect(dto.cast[0]).toMatchObject({ name: 'Harrison Ford', role: 'Deckard' });
    expect(dto.sources.tmdb).toBe(false);
  });

  it('proxies plex image paths through /api/hls/<linkId>/img/<blob>', () => {
    const dto = buildPlayerMetadata({ linkId: LINK_ID, plex: plexFixture(), tmdb: null });
    expect(dto.posterUrl).toMatch(new RegExp(`^/api/hls/${LINK_ID}/img/`));
    expect(dto.backdropUrl).toMatch(new RegExp(`^/api/hls/${LINK_ID}/img/`));
    expect(dto.cast[0].thumbUrl).toMatch(new RegExp(`^/api/hls/${LINK_ID}/img/`));
    expect(dto.cast[1].thumbUrl).toBeNull();
    // Path must never leak in the URL.
    expect(dto.posterUrl).not.toContain('/library/metadata');
  });

  it('backfills from tmdb when plex fields are empty', () => {
    const sparsePlex = plexFixture({
      summary: undefined,
      Genre: undefined,
      Role: undefined,
      thumb: undefined,
      art: undefined,
      tagline: undefined,
    });
    const dto = buildPlayerMetadata({
      linkId: LINK_ID,
      plex: sparsePlex,
      tmdb: tmdbFixture(),
    });
    expect(dto.summary).toBe('TMDB overview');
    expect(dto.genres).toEqual(['Science Fiction', 'Thriller']);
    expect(dto.cast[0].name).toBe('Harrison Ford');
    expect(dto.posterUrl).toBe('https://img.example/poster.jpg');
    expect(dto.backdropUrl).toBe('https://img.example/backdrop.jpg');
    expect(dto.tagline).toContain('Man has made his match');
    expect(dto.sources.tmdb).toBe(true);
  });

  it('emits episode context with show title and season/episode indices', () => {
    const episode = plexFixture({
      type: 'episode',
      ratingKey: '99',
      title: 'Pilot',
      index: 1,
      parentIndex: 1,
      parentTitle: 'Season 1',
      parentYear: 2016,
      grandparentTitle: 'Stranger Things',
      grandparentRatingKey: 'show-1',
      year: 2016,
    });
    const dto = buildPlayerMetadata({ linkId: LINK_ID, plex: episode, tmdb: null });
    expect(dto.kind).toBe('episode');
    expect(dto.episodeIndex).toBe(1);
    expect(dto.seasonIndex).toBe(1);
    expect(dto.seasonTitle).toBe('Season 1');
    expect(dto.show?.title).toBe('Stranger Things');
    expect(dto.show?.ratingKey).toBe('show-1');
  });

  it('merges ratings from both sources without overwriting plex values', () => {
    const dto = buildPlayerMetadata({
      linkId: LINK_ID,
      plex: plexFixture({ rating: 8.1 }),
      tmdb: tmdbFixture({ voteAverage: 7.9 }),
    });
    expect(dto.ratings.plex).toBe(8.1);
    expect(dto.ratings.tmdb).toBe(7.9);
  });

  it('prefers plex cast when present (does not overwrite with tmdb)', () => {
    const dto = buildPlayerMetadata({
      linkId: LINK_ID,
      plex: plexFixture(),
      tmdb: tmdbFixture({
        cast: [{ name: 'Someone Else', character: 'x', profilePath: null }],
      }),
    });
    expect(dto.cast[0].name).toBe('Harrison Ford');
  });
});
