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
        isShowEpisode={mediaType === 'show'}
        onBack={mediaType === 'show' ? () => setSelectedRatingKey(null) : undefined}
      />
    );
  }

  return <EpisodePicker linkId={linkId} onPick={(ratingKey) => setSelectedRatingKey(ratingKey)} />;
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load episodes');
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
      <div className="flex items-center gap-2 py-4" role="status" aria-live="polite">
        {/* Animated dot row */}
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-np-muted"
          style={{ animation: 'np-breathe 1.2s ease-in-out 0ms infinite' }}
          aria-hidden="true"
        />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-np-muted"
          style={{ animation: 'np-breathe 1.2s ease-in-out 200ms infinite' }}
          aria-hidden="true"
        />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-np-muted"
          style={{ animation: 'np-breathe 1.2s ease-in-out 400ms infinite' }}
          aria-hidden="true"
        />
        <span className="font-mono text-sm text-np-muted sr-only">Loading episodes…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass p-4 flex items-start gap-3" role="alert" aria-live="assertive">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-np-magenta mt-0.5 shrink-0"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M8 4.5v4M8 10.5v.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        <p className="font-mono text-sm text-np-magenta">{error ?? 'No episodes available.'}</p>
      </div>
    );
  }

  const activeSeason = data.seasons.find((s) => s.ratingKey === activeSeasonKey) ?? data.seasons[0];

  return (
    <div className="flex flex-col gap-4 animate-enter">
      {/* Season tabs */}
      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Season selector">
        {data.seasons.map((s) => {
          const selected = s.ratingKey === activeSeason?.ratingKey;
          return (
            <button
              key={s.ratingKey}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveSeasonKey(s.ratingKey)}
              className={`season-tab${selected ? ' active' : ''}`}
            >
              {s.title}
            </button>
          );
        })}
      </div>

      {/* Episode list */}
      <div
        className="flex flex-col gap-2"
        role="tabpanel"
        aria-label={activeSeason?.title ?? 'Episodes'}
      >
        {(activeSeason?.episodes ?? []).map((e) => {
          const resumePos = resumeMap[e.ratingKey] ?? 0;
          const hasResume = resumePos > RESUME_THRESHOLD_MS;
          return (
            <button
              key={e.ratingKey}
              type="button"
              onClick={() => onPick(e.ratingKey)}
              className="episode-row"
              aria-label={`Play ${e.index !== null ? `episode ${e.index}, ` : ''}${e.title}${hasResume ? ` — resume from ${formatHms(resumePos)}` : ''}`}
            >
              <span className="flex-1 min-w-0">
                <span className="font-mono text-sm text-np-fg">
                  {e.index !== null ? `${e.index}.\u00A0` : ''}
                  {e.title}
                </span>
                {e.summary ? (
                  <span className="block font-mono text-xs text-np-muted mt-0.5 truncate">
                    {e.summary}
                  </span>
                ) : null}
              </span>
              {hasResume ? (
                <span
                  className="badge shrink-0"
                  style={{ borderColor: 'var(--np-green)', color: 'var(--np-green)' }}
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
  isShowEpisode,
  onBack,
}: {
  linkId: string;
  ratingKey: string;
  title: string;
  isShowEpisode: boolean;
  onBack?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeAppliedRef = useRef(false);
  const [resumeOffer, setResumeOffer] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showAirplayHint, setShowAirplayHint] = useState(false);
  const airplayHintFiredRef = useRef(false);

  const hlsUrl = useMemo(() => {
    const base = `/api/hls/${linkId}/index.m3u8`;
    return isShowEpisode ? `${base}?rk=${encodeURIComponent(ratingKey)}` : base;
  }, [linkId, ratingKey, isShowEpisode]);

  // Preload saved position so we can offer a "Resume" UI before playback
  // begins. We intentionally don't auto-seek — some players get confused if
  // we seek before first `loadedmetadata` — so we wait for user consent via
  // the resume banner (or auto-apply on metadata load if banner is absent).
  useEffect(() => {
    resumeAppliedRef.current = false;
    setResumeOffer(null);
    setVideoError(null);
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
      const durationMs = Number.isFinite(video.duration) ? Math.floor(video.duration * 1000) : null;
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

    const onPlay = () => {
      setIsBuffering(false);
      startLoops();
      // Fire the AirPlay hint once, after playback actually starts — avoids
      // showing it while the recipient is still deciding to play.
      if (!airplayHintFiredRef.current) {
        airplayHintFiredRef.current = true;
        setShowAirplayHint(true);
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
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onError = () => {
      setVideoError('Playback error — try refreshing the page.');
      stopLoops();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    const onPageHide = () => void saveProgress();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
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
    <div className="flex flex-col gap-3 animate-enter">
      {/* Title + back nav */}
      <div className="flex items-center gap-3 min-w-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost shrink-0"
            aria-label="Back to episode list"
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
          >
            ← Episodes
          </button>
        ) : null}
        <h1 className="font-display text-xl sm:text-2xl uppercase tracking-widest text-np-cyan truncate min-w-0">
          {title}
        </h1>
      </div>

      {/* Resume offer */}
      {resumeOffer !== null ? (
        <div
          className="flex items-center justify-between gap-3 p-3 rounded-sharp"
          style={{
            background: 'var(--np-green-subtle)',
            border: '1px solid var(--np-green)',
          }}
          role="region"
          aria-label="Resume playback"
        >
          <span className="font-mono text-sm text-np-fg">
            Resume from {formatHms(resumeOffer)}?
          </span>
          <span className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={acceptResume}
              className="btn-primary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
            >
              Resume
            </button>
            <button
              type="button"
              onClick={dismissResume}
              className="btn-ghost"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
            >
              Start over
            </button>
          </span>
        </div>
      ) : null}

      {/* Video wrapper with buffering indicator */}
      <div className="relative w-full bg-black rounded-sharp overflow-hidden">
        <video
          ref={videoRef}
          src={hlsUrl}
          controls
          playsInline
          className="w-full rounded-sharp bg-black block"
          style={{ maxHeight: '70vh' }}
          aria-label={`Video player — ${title}`}
        />
        {/* Buffering overlay — shown during waiting events */}
        {isBuffering ? (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full bg-np-cyan"
                style={{ animation: 'np-breathe 1s ease-in-out 0ms infinite' }}
              />
              <span
                className="inline-block w-2 h-2 rounded-full bg-np-cyan"
                style={{ animation: 'np-breathe 1s ease-in-out 150ms infinite' }}
              />
              <span
                className="inline-block w-2 h-2 rounded-full bg-np-cyan"
                style={{ animation: 'np-breathe 1s ease-in-out 300ms infinite' }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Playback error */}
      {videoError !== null ? (
        <div
          className="flex items-start gap-3 p-3 rounded-sharp"
          style={{
            background: 'var(--np-magenta-subtle, rgba(255,0,229,0.06))',
            border: '1px solid var(--np-magenta)',
          }}
          role="alert"
          aria-live="assertive"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-np-magenta mt-0.5 shrink-0"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M8 4.5v4M8 10.5v.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <p className="font-mono text-sm text-np-magenta">{videoError}</p>
        </div>
      ) : null}

      {/* AirPlay hint — iOS Safari only, visible after first play event */}
      <AirplayHint visible={showAirplayHint} />
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
