'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AirplayHint } from './AirplayHint';

interface Episode {
  ratingKey: string;
  index: number | null;
  title: string;
  summary: string | null;
  durationMs: number | null;
  thumb: string | null;
}

interface Season {
  ratingKey: string;
  index: number | null;
  title: string;
  episodeCount: number | null;
  episodes: Episode[];
}

interface EpisodesResponse {
  show: { ratingKey: string; title: string; summary: string | null };
  seasons: Season[];
}

interface ResumeResponse {
  ratingKey: string;
  positionMs: number;
  durationMs: number | null;
}

export interface ShareWatcherProps {
  linkId: string;
  title: string;
  mediaType: 'movie' | 'episode' | 'show';
  rootRatingKey: string;
}

const PROGRESS_INTERVAL_MS = 10_000;
const RESUME_THRESHOLD_MS = 20_000; // don't show "resume" if < 20s in
const NEAR_END_MS = 60_000; // treat last minute as "finished" — start over

export function ShareWatcher({ linkId, title, mediaType, rootRatingKey }: ShareWatcherProps) {
  const [selectedRatingKey, setSelectedRatingKey] = useState<string | null>(
    mediaType === 'show' ? null : rootRatingKey,
  );

  if (mediaType !== 'show' || selectedRatingKey) {
    return (
      <Player
        linkId={linkId}
        ratingKey={selectedRatingKey ?? rootRatingKey}
        title={title}
        onBack={
          mediaType === 'show' ? () => setSelectedRatingKey(null) : undefined
        }
      />
    );
  }

  return (
    <EpisodePicker
      linkId={linkId}
      onPick={(ratingKey) => setSelectedRatingKey(ratingKey)}
    />
  );
}

// ---------------------------------------------------------------------------
// Episode picker
// ---------------------------------------------------------------------------

function EpisodePicker({
  linkId,
  onPick,
}: {
  linkId: string;
  onPick: (ratingKey: string) => void;
}) {
  const [data, setData] = useState<EpisodesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSeasonKey, setActiveSeasonKey] = useState<string | null>(null);
  const [resumeMap, setResumeMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/hls/${linkId}/episodes`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as EpisodesResponse;
        if (cancelled) return;
        setData(json);
        const firstWithEps = json.seasons.find((s) => s.episodes.length > 0);
        setActiveSeasonKey(firstWithEps?.ratingKey ?? json.seasons[0]?.ratingKey ?? null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load episodes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  // Best-effort batch-style resume lookup. We fetch per-episode in the
  // background so viewers see a "Resume" badge without blocking render.
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const all = data.seasons.flatMap((s) => s.episodes.map((e) => e.ratingKey));
    (async () => {
      const results = await Promise.all(
        all.map(async (rk) => {
          try {
            const res = await fetch(
              `/api/hls/${linkId}/resume?ratingKey=${encodeURIComponent(rk)}`,
              { signal: controller.signal, cache: 'no-store' },
            );
            if (!res.ok) return [rk, 0] as const;
            const json = (await res.json()) as ResumeResponse;
            return [rk, json.positionMs] as const;
          } catch {
            return [rk, 0] as const;
          }
        }),
      );
      if (controller.signal.aborted) return;
      const map: Record<string, number> = {};
      for (const [rk, pos] of results) if (pos > 0) map[rk] = pos;
      setResumeMap(map);
    })();
    return () => controller.abort();
  }, [data, linkId]);

  if (loading) {
    return (
      <p style={{ color: 'var(--np-muted)', fontSize: '0.9rem' }}>Loading episodes…</p>
    );
  }
  if (error || !data) {
    return (
      <p style={{ color: 'var(--np-magenta)', fontSize: '0.9rem' }}>
        {error ?? 'No episodes available.'}
      </p>
    );
  }

  const activeSeason =
    data.seasons.find((s) => s.ratingKey === activeSeasonKey) ?? data.seasons[0];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          overflowX: 'auto',
        }}
      >
        {data.seasons.map((s) => {
          const selected = s.ratingKey === activeSeason?.ratingKey;
          return (
            <button
              key={s.ratingKey}
              type="button"
              onClick={() => setActiveSeasonKey(s.ratingKey)}
              style={{
                padding: '0.4rem 0.9rem',
                fontSize: '0.8rem',
                fontFamily: 'var(--np-font-display)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                background: selected ? 'var(--np-cyan)' : 'transparent',
                color: selected ? 'var(--np-bg)' : 'var(--np-fg)',
                border: '1px solid var(--np-muted)',
                borderRadius: 'var(--np-radius-sharp)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.title}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(activeSeason?.episodes ?? []).map((e) => {
          const resumePos = resumeMap[e.ratingKey] ?? 0;
          const hasResume = resumePos > RESUME_THRESHOLD_MS;
          return (
            <button
              key={e.ratingKey}
              type="button"
              onClick={() => onPick(e.ratingKey)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.75rem 1rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--np-muted)',
                borderRadius: 'var(--np-radius-sharp)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--np-fg)',
                width: '100%',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '0.95rem' }}>
                  {e.index !== null ? `${e.index}. ` : ''}
                  {e.title}
                </span>
                {e.summary ? (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: 'var(--np-muted)',
                      marginTop: '0.25rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {e.summary}
                  </span>
                ) : null}
              </span>
              {hasResume ? (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontFamily: 'var(--np-font-display)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--np-green)',
                    border: '1px solid var(--np-green)',
                    padding: '0.15rem 0.4rem',
                    borderRadius: 'var(--np-radius-sharp)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Resume
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function Player({
  linkId,
  ratingKey,
  title,
  onBack,
}: {
  linkId: string;
  ratingKey: string;
  title: string;
  onBack?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeAppliedRef = useRef(false);
  const [resumeOffer, setResumeOffer] = useState<number | null>(null);

  const hlsUrl = useMemo(() => {
    const base = `/api/hls/${linkId}/index.m3u8`;
    return `${base}?rk=${encodeURIComponent(ratingKey)}`;
  }, [linkId, ratingKey]);

  // Preload saved position so we can offer a "Resume" UI before playback
  // begins. We intentionally don't auto-seek — some players get confused if
  // we seek before first `loadedmetadata` — so we wait for user consent via
  // the resume banner (or auto-apply on metadata load if banner is absent).
  useEffect(() => {
    resumeAppliedRef.current = false;
    setResumeOffer(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/hls/${linkId}/resume?ratingKey=${encodeURIComponent(ratingKey)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const json = (await res.json()) as ResumeResponse;
        if (cancelled) return;
        const pos = json.positionMs;
        const dur = json.durationMs;
        const tooLate = dur !== null && dur - pos < NEAR_END_MS;
        if (pos > RESUME_THRESHOLD_MS && !tooLate) {
          setResumeOffer(pos);
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId, ratingKey]);

  // HLS attachment.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) return;

    let hlsInstance: {
      loadSource: (url: string) => void;
      attachMedia: (el: HTMLVideoElement) => void;
      destroy: () => void;
    } | null = null;
    let cancelled = false;

    void import('hls.js').then((mod) => {
      if (cancelled) return;
      const Hls = mod.default;
      if (Hls.isSupported()) {
        hlsInstance = new Hls();
        hlsInstance.loadSource(hlsUrl);
        hlsInstance.attachMedia(video);
      }
    });

    return () => {
      cancelled = true;
      hlsInstance?.destroy();
    };
  }, [hlsUrl]);

  // Ping (keep Plex transcode session alive) + progress save loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const saveProgress = async () => {
      const positionMs = Math.floor(video.currentTime * 1000);
      const durationMs = Number.isFinite(video.duration)
        ? Math.floor(video.duration * 1000)
        : null;
      try {
        await fetch(`/api/hls/${linkId}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ratingKey, positionMs, durationMs }),
          keepalive: true,
        });
      } catch {
        /* non-fatal */
      }
    };

    const startLoops = () => {
      if (pingRef.current === null) {
        pingRef.current = setInterval(() => {
          void fetch(`/api/hls/${linkId}/ping`, { method: 'POST' });
        }, 30_000);
      }
      if (progressRef.current === null) {
        progressRef.current = setInterval(() => {
          void saveProgress();
        }, PROGRESS_INTERVAL_MS);
      }
    };
    const stopLoops = () => {
      if (pingRef.current !== null) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (progressRef.current !== null) {
        clearInterval(progressRef.current);
        progressRef.current = null;
      }
    };

    const onPause = () => {
      void saveProgress();
      stopLoops();
    };
    const onEnded = () => {
      void saveProgress();
      stopLoops();
    };

    video.addEventListener('play', startLoops);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    const onPageHide = () => void saveProgress();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      video.removeEventListener('play', startLoops);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', onPageHide);
      stopLoops();
      void saveProgress();
    };
  }, [linkId, ratingKey]);

  const acceptResume = useCallback(() => {
    const v = videoRef.current;
    if (!v || resumeOffer === null) return;
    const seek = () => {
      v.currentTime = Math.max(0, resumeOffer / 1000 - 2);
      resumeAppliedRef.current = true;
      setResumeOffer(null);
      void v.play().catch(() => {
        /* autoplay may be blocked — user can tap play */
      });
    };
    if (v.readyState >= 1 && Number.isFinite(v.duration)) {
      seek();
    } else {
      v.addEventListener('loadedmetadata', seek, { once: true });
      void v.load();
    }
  }, [resumeOffer]);

  const dismissResume = useCallback(() => setResumeOffer(null), []);

  return (
    <div className="flex flex-col gap-2">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '0.3rem 0.75rem',
              background: 'transparent',
              border: '1px solid var(--np-muted)',
              borderRadius: 'var(--np-radius-sharp)',
              color: 'var(--np-muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontFamily: 'var(--np-font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            ← Episodes
          </button>
        ) : null}
        <h1
          className="text-2xl font-display uppercase tracking-widest"
          style={{ color: 'var(--np-cyan)', margin: 0 }}
        >
          {title}
        </h1>
      </div>
      {resumeOffer !== null ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.6rem 0.9rem',
            background: 'rgba(0, 200, 150, 0.1)',
            border: '1px solid var(--np-green)',
            borderRadius: 'var(--np-radius-sharp)',
            fontSize: '0.85rem',
          }}
        >
          <span>Resume from {formatHms(resumeOffer)}?</span>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={acceptResume}
              style={{
                padding: '0.3rem 0.75rem',
                background: 'var(--np-green)',
                color: 'var(--np-bg)',
                border: '1px solid var(--np-green)',
                borderRadius: 'var(--np-radius-sharp)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontFamily: 'var(--np-font-display)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Resume
            </button>
            <button
              type="button"
              onClick={dismissResume}
              style={{
                padding: '0.3rem 0.75rem',
                background: 'transparent',
                color: 'var(--np-muted)',
                border: '1px solid var(--np-muted)',
                borderRadius: 'var(--np-radius-sharp)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontFamily: 'var(--np-font-display)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Start over
            </button>
          </span>
        </div>
      ) : null}
      <video
        ref={videoRef}
        src={hlsUrl}
        controls
        playsInline
        className="w-full rounded-sharp bg-black"
        style={{ maxHeight: '70vh' }}
      />
      <AirplayHint />
    </div>
  );
}

function formatHms(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
