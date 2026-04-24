'use client';

import Image from 'next/image';

import { formatRuntime } from './formatTime';
import type { PlayerMetadata } from '@/lib/player-metadata';

interface MetadataTabProps {
  data: PlayerMetadata | null;
  loading: boolean;
  error: string | null;
}

function formatRating(r: number | null): string | null {
  if (r === null || !Number.isFinite(r)) return null;
  return r.toFixed(1);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function MetadataTab({ data, loading, error }: MetadataTabProps) {
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2" role="status" aria-live="polite">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-np-muted"
          style={{ animation: 'np-breathe 1.2s ease-in-out 0ms infinite' }}
        />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-np-muted"
          style={{ animation: 'np-breathe 1.2s ease-in-out 200ms infinite' }}
        />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-np-muted"
          style={{ animation: 'np-breathe 1.2s ease-in-out 400ms infinite' }}
        />
        <span className="font-mono text-xs text-np-muted ml-2">Loading details…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6" role="alert">
        <p className="font-mono text-sm text-np-magenta">{error ?? 'No details available.'}</p>
      </div>
    );
  }

  const runtime = formatRuntime(data.durationMs);
  const released = formatDate(data.originallyAvailableAt);
  const chips: (string | null)[] = [
    data.year ? String(data.year) : null,
    runtime,
    data.contentRating,
    data.kind === 'episode' ? `S${data.seasonIndex ?? '?'}·E${data.episodeIndex ?? '?'}` : null,
  ];

  const plexRating = formatRating(data.ratings.plex);
  const audienceRating = formatRating(data.ratings.audience);
  const tmdbRating = formatRating(data.ratings.tmdb);

  return (
    <div className="player-panel-scroll flex flex-col gap-5 p-4 sm:p-5">
      {data.backdropUrl ? (
        <div className="player-panel-backdrop" aria-hidden="true">
          <Image
            src={data.backdropUrl}
            alt=""
            width={720}
            height={405}
            unoptimized
            className="w-full h-auto object-cover"
          />
          <div className="player-panel-backdrop-fade" />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {data.kind === 'episode' && data.show ? (
          <p className="font-mono text-xs uppercase tracking-widest text-np-cyan">
            {data.show.title}
          </p>
        ) : null}
        <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wide text-np-fg leading-tight">
          {data.title}
        </h2>
        {data.tagline ? (
          <p className="font-mono text-sm italic text-np-muted">{data.tagline}</p>
        ) : null}
      </div>

      {chips.some((c) => c) ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) =>
            c ? (
              <span
                key={`${c}-${i}`}
                className="badge"
                style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem' }}
              >
                {c}
              </span>
            ) : null,
          )}
        </div>
      ) : null}

      {plexRating || audienceRating || tmdbRating ? (
        <div className="flex flex-wrap gap-4 text-xs font-mono">
          {plexRating ? (
            <div>
              <span className="text-np-muted">Critic</span>
              <span className="ml-2 text-np-fg">{plexRating}</span>
            </div>
          ) : null}
          {audienceRating ? (
            <div>
              <span className="text-np-muted">Audience</span>
              <span className="ml-2 text-np-fg">{audienceRating}</span>
            </div>
          ) : null}
          {tmdbRating ? (
            <div>
              <span className="text-np-muted">TMDB</span>
              <span className="ml-2 text-np-fg">{tmdbRating}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {data.summary ? (
        <p className="font-mono text-sm leading-relaxed text-np-fg whitespace-pre-line">
          {data.summary}
        </p>
      ) : null}

      {data.genres.length > 0 ? (
        <section>
          <h3 className="metadata-section-title">Genres</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.genres.map((g) => (
              <span key={g} className="genre-chip">
                {g}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {data.directors.length > 0 ? (
        <section>
          <h3 className="metadata-section-title">
            {data.directors.length === 1 ? 'Director' : 'Directors'}
          </h3>
          <p className="font-mono text-sm text-np-fg">{data.directors.join(', ')}</p>
        </section>
      ) : null}

      {data.writers.length > 0 ? (
        <section>
          <h3 className="metadata-section-title">
            {data.writers.length === 1 ? 'Writer' : 'Writers'}
          </h3>
          <p className="font-mono text-sm text-np-fg">{data.writers.join(', ')}</p>
        </section>
      ) : null}

      {data.studio ? (
        <section>
          <h3 className="metadata-section-title">Studio</h3>
          <p className="font-mono text-sm text-np-fg">{data.studio}</p>
        </section>
      ) : null}

      {released ? (
        <section>
          <h3 className="metadata-section-title">Released</h3>
          <p className="font-mono text-sm text-np-fg">{released}</p>
        </section>
      ) : null}

      {data.cast.length > 0 ? (
        <section>
          <h3 className="metadata-section-title">Cast</h3>
          <ul className="flex flex-col gap-2.5">
            {data.cast.map((m, i) => (
              <li key={`${m.name}-${i}`} className="flex items-center gap-3">
                <div className="cast-thumb">
                  {m.thumbUrl ? (
                    <Image
                      src={m.thumbUrl}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="w-10 h-10 object-cover rounded-sharp"
                    />
                  ) : (
                    <span aria-hidden="true" className="cast-thumb-fallback">
                      {m.name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-np-fg truncate">{m.name}</p>
                  {m.role ? (
                    <p className="font-mono text-xs text-np-muted truncate">{m.role}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.imdbId || data.sources.tmdb ? (
        <section>
          <h3 className="metadata-section-title">External</h3>
          <div className="flex flex-wrap gap-3 font-mono text-xs">
            {data.imdbId ? (
              <a
                href={`https://www.imdb.com/title/${data.imdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-np-cyan hover:text-np-fg"
              >
                IMDb ↗
              </a>
            ) : null}
            {data.tmdbId ? (
              <a
                href={`https://www.themoviedb.org/${data.kind === 'movie' ? 'movie' : 'tv'}/${data.tmdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-np-cyan hover:text-np-fg"
              >
                TMDB ↗
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
