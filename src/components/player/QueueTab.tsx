'use client';

import { formatHms, formatRuntime } from './formatTime';

interface QueueEpisode {
  ratingKey: string;
  index: number | null;
  title: string;
  summary: string | null;
  durationMs: number | null;
  thumb: string | null;
}

interface QueueSeason {
  ratingKey: string;
  index: number | null;
  title: string;
  episodes: QueueEpisode[];
}

interface QueueData {
  show?: { title: string } | null;
  seasons?: QueueSeason[];
}

interface QueueTabProps {
  kind: 'movie' | 'episode' | 'show';
  currentRatingKey: string;
  queue: QueueData | null;
  loading: boolean;
  resumeMap?: Record<string, number>;
  onSelect: (ratingKey: string) => void;
}

export function QueueTab({
  kind,
  currentRatingKey,
  queue,
  loading,
  resumeMap = {},
  onSelect,
}: QueueTabProps) {
  if (kind === 'movie') {
    return (
      <div className="p-6 text-center flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border border-np-muted/40 flex items-center justify-center text-np-muted">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="14"
              height="12"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path d="M6 7h6M6 10h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
        <p className="font-mono text-sm text-np-muted">Standalone title — no queue.</p>
      </div>
    );
  }

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
        <span className="font-mono text-xs text-np-muted ml-2">Loading queue…</span>
      </div>
    );
  }

  if (!queue?.seasons || queue.seasons.length === 0) {
    return (
      <div className="p-6">
        <p className="font-mono text-sm text-np-muted">No episodes available.</p>
      </div>
    );
  }

  return (
    <div className="player-panel-scroll p-3 sm:p-4">
      {queue.show?.title ? (
        <h2 className="font-display text-lg uppercase tracking-wide text-np-cyan mb-3 px-1">
          {queue.show.title}
        </h2>
      ) : null}
      <div className="flex flex-col gap-4">
        {queue.seasons.map((s) => (
          <section key={s.ratingKey} aria-label={s.title}>
            <h3 className="metadata-section-title px-1">{s.title}</h3>
            <div className="flex flex-col gap-1.5 mt-1.5">
              {s.episodes.map((e) => {
                const selected = e.ratingKey === currentRatingKey;
                const resumePos = resumeMap[e.ratingKey] ?? 0;
                const hasResume = resumePos > 20_000;
                const runtime = formatRuntime(e.durationMs);
                return (
                  <button
                    key={e.ratingKey}
                    type="button"
                    onClick={() => onSelect(e.ratingKey)}
                    className={`queue-row${selected ? ' selected' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <span className="queue-row-index">{e.index !== null ? e.index : '·'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm text-np-fg truncate">{e.title}</span>
                        {runtime ? (
                          <span className="font-mono text-[10px] text-np-muted shrink-0">
                            {runtime}
                          </span>
                        ) : null}
                      </span>
                      {e.summary ? (
                        <span className="block font-mono text-xs text-np-muted line-clamp-2 mt-0.5">
                          {e.summary}
                        </span>
                      ) : null}
                    </span>
                    {hasResume && !selected ? (
                      <span
                        className="badge shrink-0"
                        style={{
                          borderColor: 'var(--np-green)',
                          color: 'var(--np-green)',
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.4rem',
                        }}
                      >
                        {formatHms(resumePos)}
                      </span>
                    ) : null}
                    {selected ? (
                      <span
                        className="badge shrink-0"
                        style={{
                          borderColor: 'var(--np-cyan)',
                          color: 'var(--np-cyan)',
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.4rem',
                        }}
                      >
                        NOW
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
