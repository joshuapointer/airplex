import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('tmdb helpers', () => {
  const ORIGINAL_KEY = process.env['TMDB_API_KEY'];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    if (ORIGINAL_KEY === undefined) {
      delete process.env['TMDB_API_KEY'];
    } else {
      process.env['TMDB_API_KEY'] = ORIGINAL_KEY;
    }
  });

  describe('when TMDB_API_KEY is absent', () => {
    beforeEach(() => {
      delete process.env['TMDB_API_KEY'];
      vi.resetModules();
    });

    it('tmdbEnabled() returns false', async () => {
      const { tmdbEnabled } = await import('@/lib/tmdb');
      expect(tmdbEnabled()).toBe(false);
    });

    it('findMovie() returns null without hitting the network', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const { findMovie } = await import('@/lib/tmdb');
      const result = await findMovie('Blade Runner', 1982);
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('findTv() returns null without hitting the network', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const { findTv } = await import('@/lib/tmdb');
      const result = await findTv('Stranger Things');
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('when TMDB_API_KEY is set', () => {
    beforeEach(() => {
      process.env['TMDB_API_KEY'] = 'test-tmdb-key';
      vi.resetModules();
    });

    it('findMovie() searches then fetches details and normalizes', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof URL ? input : new URL(String(input));
        if (url.pathname === '/3/search/movie') {
          return new Response(JSON.stringify({ results: [{ id: 78 }] }), { status: 200 });
        }
        if (url.pathname === '/3/movie/78') {
          return new Response(
            JSON.stringify({
              id: 78,
              title: 'Blade Runner',
              release_date: '1982-06-25',
              runtime: 117,
              tagline: 't',
              overview: 'o',
              genres: [{ id: 878, name: 'Sci-Fi' }],
              vote_average: 8.1,
              vote_count: 10_000,
              poster_path: '/p.jpg',
              backdrop_path: '/b.jpg',
              imdb_id: 'tt0083658',
              credits: {
                cast: [
                  { name: 'Harrison Ford', character: 'Deckard', profile_path: '/h.jpg', order: 0 },
                ],
                crew: [
                  { name: 'Ridley Scott', job: 'Director', department: 'Directing' },
                  { name: 'Hampton Fancher', job: 'Screenplay', department: 'Writing' },
                ],
              },
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch ${url.pathname}`);
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const { findMovie } = await import('@/lib/tmdb');
      const m = await findMovie('Blade Runner', 1982);
      expect(m).not.toBeNull();
      expect(m!.title).toBe('Blade Runner');
      expect(m!.year).toBe(1982);
      expect(m!.runtimeMs).toBe(117 * 60_000);
      expect(m!.directors).toEqual(['Ridley Scott']);
      expect(m!.writers).toContain('Hampton Fancher');
      expect(m!.cast[0].name).toBe('Harrison Ford');
      expect(m!.posterUrl).toMatch(/\/p\.jpg$/);
      expect(m!.imdbId).toBe('tt0083658');
    });

    it('findMovie() returns null on empty search results', async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const { findMovie } = await import('@/lib/tmdb');
      const m = await findMovie('Unknown Title', 1800);
      expect(m).toBeNull();
    });

    it('findMovie() returns null on non-ok responses', async () => {
      const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      const { findMovie } = await import('@/lib/tmdb');
      const m = await findMovie('Anything');
      expect(m).toBeNull();
    });
  });
});
