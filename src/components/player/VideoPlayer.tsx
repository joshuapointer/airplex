'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { formatTime, formatTimeLong } from './formatTime';
import { useHlsPlayer, type HlsLevel } from './useHlsPlayer';
import { usePlayerPrefs } from './usePlayerPrefs';

const SKIP_SECONDS = 10;
const CONTROLS_HIDE_MS = 2800;
const DOUBLE_TAP_WINDOW_MS = 260;
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type MenuKind = 'rate' | 'quality' | 'captions' | null;

interface TrackInfo {
  id: string;
  label: string;
  lang: string | null;
  mode: TextTrackMode;
}

export interface VideoPlayerProps {
  src: string;
  title: string;
  poster?: string | null;
  autoPlay?: boolean;
  startPositionSec?: number | null;
  onTimeUpdate?: (currentSec: number, durationSec: number | null) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: () => void;
  onNearEnd?: () => void;
  nearEndThresholdSec?: number;
  children?: ReactNode;
  /**
   * Called when the user clicks the "info" button in the control bar.
   * If omitted, the button is hidden.
   */
  onOpenPanel?: () => void;
  /** Whether the side panel is currently open — used for aria-pressed state. */
  panelOpen?: boolean;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

interface WebKitVideoElement extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitShowPlaybackTargetPicker?: () => void;
}

interface WebKitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

export function VideoPlayer({
  src,
  title,
  poster,
  autoPlay = false,
  startPositionSec,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onError,
  onNearEnd,
  nearEndThresholdSec = 15,
  children,
  onOpenPanel,
  panelOpen = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const hls = useHlsPlayer(videoEl, src);
  const [prefs, setPrefs, prefsHydrated] = usePlayerPrefs();

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fatalError, setFatalError] = useState(false);
  const [started, setStarted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null);
  const [scrubPreviewPct, setScrubPreviewPct] = useState(0);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [fsActive, setFsActive] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [airplayAvailable, setAirplayAvailable] = useState(false);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [seekFlash, setSeekFlash] = useState<'fwd' | 'back' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ side: 'left' | 'right' | 'center'; ts: number } | null>(null);
  const startPositionAppliedRef = useRef(false);
  const nearEndFiredRef = useRef(false);
  const scrubBarRef = useRef<HTMLDivElement>(null);
  const pointerInsideRef = useRef(false);

  // Attach element ref into state for the HLS hook.
  useEffect(() => {
    setVideoEl(videoRef.current);
  }, []);

  // Reset per-source flags whenever src changes.
  useEffect(() => {
    startPositionAppliedRef.current = false;
    nearEndFiredRef.current = false;
    setFatalError(false);
    setStarted(false);
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    lastTapRef.current = null;
  }, [src]);

  // Re-apply start position if parent changes it (e.g. user accepts resume banner).
  useEffect(() => {
    startPositionAppliedRef.current = false;
  }, [startPositionSec]);

  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (seekFlashTimerRef.current) clearTimeout(seekFlashTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Apply prefs on element (volume, muted, rate) — only once hydrated to avoid
  // clobbering stored prefs with defaults on first mount.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !prefsHydrated) return;
    v.volume = prefs.volume;
    v.muted = prefs.muted;
    v.playbackRate = prefs.rate;
  }, [prefs.volume, prefs.muted, prefs.rate, prefsHydrated, videoEl]);

  // Video element event wiring.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const updateBuffered = () => {
      const b = v.buffered;
      if (b.length === 0) {
        setBufferedEnd(0);
        return;
      }
      const cur = v.currentTime;
      let end = 0;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= cur && b.end(i) >= end) end = b.end(i);
      }
      setBufferedEnd(end);
    };

    const handleLoaded = () => {
      const d = Number.isFinite(v.duration) ? v.duration : null;
      setDuration(d);
      // Apply start position once metadata is known.
      if (
        !startPositionAppliedRef.current &&
        typeof startPositionSec === 'number' &&
        startPositionSec > 0 &&
        (d === null || startPositionSec < d - 2)
      ) {
        try {
          v.currentTime = startPositionSec;
        } catch {
          /* ignore */
        }
        startPositionAppliedRef.current = true;
      }
    };
    const handleTime = () => {
      setCurrent(v.currentTime);
      updateBuffered();
      onTimeUpdate?.(v.currentTime, Number.isFinite(v.duration) ? v.duration : null);
      if (
        !nearEndFiredRef.current &&
        Number.isFinite(v.duration) &&
        v.duration - v.currentTime <= nearEndThresholdSec &&
        v.duration - v.currentTime > 0
      ) {
        nearEndFiredRef.current = true;
        onNearEnd?.();
      }
    };
    const handlePlay = () => {
      setPlaying(true);
      setStarted(true);
      setIsBuffering(false);
      onPlay?.();
    };
    const handlePause = () => {
      setPlaying(false);
      onPause?.();
    };
    const handleEnded = () => {
      setPlaying(false);
      onEnded?.();
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => {
      setFatalError(true);
      setIsBuffering(false);
      onError?.();
    };
    const handleVolume = () => {
      setPrefs({ volume: v.volume, muted: v.muted });
    };
    const handleRate = () => {
      setPrefs({ rate: v.playbackRate });
    };
    const handleProgress = () => updateBuffered();

    v.addEventListener('loadedmetadata', handleLoaded);
    v.addEventListener('timeupdate', handleTime);
    v.addEventListener('play', handlePlay);
    v.addEventListener('pause', handlePause);
    v.addEventListener('ended', handleEnded);
    v.addEventListener('waiting', handleWaiting);
    v.addEventListener('canplay', handleCanPlay);
    v.addEventListener('error', handleError);
    v.addEventListener('volumechange', handleVolume);
    v.addEventListener('ratechange', handleRate);
    v.addEventListener('progress', handleProgress);

    return () => {
      v.removeEventListener('loadedmetadata', handleLoaded);
      v.removeEventListener('timeupdate', handleTime);
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('pause', handlePause);
      v.removeEventListener('ended', handleEnded);
      v.removeEventListener('waiting', handleWaiting);
      v.removeEventListener('canplay', handleCanPlay);
      v.removeEventListener('error', handleError);
      v.removeEventListener('volumechange', handleVolume);
      v.removeEventListener('ratechange', handleRate);
      v.removeEventListener('progress', handleProgress);
    };
  }, [
    videoEl,
    startPositionSec,
    onTimeUpdate,
    onPlay,
    onPause,
    onEnded,
    onError,
    onNearEnd,
    nearEndThresholdSec,
    setPrefs,
  ]);

  // Text track discovery.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const syncTracks = () => {
      const out: TrackInfo[] = [];
      for (let i = 0; i < v.textTracks.length; i++) {
        const t = v.textTracks[i];
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
        out.push({
          id: String(i),
          label: t.label || t.language || `Track ${i + 1}`,
          lang: t.language || null,
          mode: t.mode,
        });
      }
      setTracks(out);
    };
    syncTracks();
    v.textTracks.addEventListener?.('addtrack', syncTracks);
    v.textTracks.addEventListener?.('removetrack', syncTracks);
    v.textTracks.addEventListener?.('change', syncTracks);
    return () => {
      v.textTracks.removeEventListener?.('addtrack', syncTracks);
      v.textTracks.removeEventListener?.('removetrack', syncTracks);
      v.textTracks.removeEventListener?.('change', syncTracks);
    };
  }, [videoEl]);

  // Apply pref captionsLang whenever tracks list changes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || tracks.length === 0) return;
    const lang = prefs.captionsLang;
    for (let i = 0; i < v.textTracks.length; i++) {
      const t = v.textTracks[i];
      if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
      t.mode = lang && (t.language === lang || t.label === lang) ? 'showing' : 'disabled';
    }
  }, [prefs.captionsLang, tracks.length, videoEl]);

  // Fullscreen state sync.
  useEffect(() => {
    const doc = document as WebKitDocument;
    const handler = () => {
      const el = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setFsActive(el === wrapRef.current || el === videoRef.current);
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler as EventListener);
    };
  }, []);

  // PiP state sync.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [videoEl]);

  // AirPlay availability (WebKit).
  useEffect(() => {
    const v = videoRef.current as HTMLVideoElement | null;
    if (!v) return;
    interface WPEvent extends Event {
      availability?: 'available' | 'not-available';
    }
    const handler = (e: Event) => {
      const ev = e as WPEvent;
      setAirplayAvailable(ev.availability === 'available');
    };
    type WP = {
      addEventListener: (ev: string, fn: EventListener) => void;
      removeEventListener: (ev: string, fn: EventListener) => void;
    };
    const wp = v as unknown as WP;
    if (typeof wp.addEventListener === 'function') {
      try {
        wp.addEventListener('webkitplaybacktargetavailabilitychanged', handler as EventListener);
      } catch {
        /* ignore */
      }
    }
    return () => {
      try {
        wp.removeEventListener('webkitplaybacktargetavailabilitychanged', handler as EventListener);
      } catch {
        /* ignore */
      }
    };
  }, [videoEl]);

  // ── Control-visibility auto-hide ───────────────────────────────────
  const armHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setMenu(null);
    }, CONTROLS_HIDE_MS);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (!playing || scrubbing) return;
    armHideTimer();
  }, [armHideTimer, playing, scrubbing]);

  useEffect(() => {
    if (!playing || scrubbing || menu !== null) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
      return;
    }
    armHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playing, scrubbing, menu, armHideTimer]);

  // ── Notice toast (brief status, e.g. "1.5x") ──────────────────────
  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 1100);
  }, []);

  // ── Player actions ─────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => setFatalError(true));
    else v.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min((v.duration || 0) - 0.1, v.currentTime + delta));
    v.currentTime = next;
    setSeekFlash(delta > 0 ? 'fwd' : 'back');
    if (seekFlashTimerRef.current) clearTimeout(seekFlashTimerRef.current);
    seekFlashTimerRef.current = setTimeout(() => setSeekFlash(null), 360);
  }, []);

  const seekTo = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.1, sec));
  }, []);

  const setVolume = useCallback((vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(1, vol));
    v.volume = clamped;
    v.muted = clamped === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const setRate = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.playbackRate = r;
      flashNotice(`${r}×`);
    },
    [flashNotice],
  );

  const toggleFs = useCallback(async () => {
    const wrap = wrapRef.current;
    const v = videoRef.current as WebKitVideoElement | null;
    if (!wrap || !v) return;
    const doc = document as WebKitDocument;
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
    if (active) {
      if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      return;
    }
    if (wrap.requestFullscreen) {
      await wrap.requestFullscreen().catch(() => {
        // iOS: fall back to native video fullscreen.
        v.webkitEnterFullscreen?.();
      });
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen();
    }
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if ((document as Document).pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (typeof v.requestPictureInPicture === 'function') {
        await v.requestPictureInPicture();
      }
    } catch {
      /* user-reject or unsupported */
    }
  }, []);

  const triggerAirplay = useCallback(() => {
    const v = videoRef.current as WebKitVideoElement | null;
    if (!v) return;
    v.webkitShowPlaybackTargetPicker?.();
  }, []);

  const selectCaptions = useCallback(
    (lang: string | null) => {
      setPrefs({ captionsLang: lang });
      flashNotice(lang ? `CC: ${lang}` : 'CC: off');
      setMenu(null);
    },
    [flashNotice, setPrefs],
  );

  const selectQuality = useCallback(
    (id: number) => {
      hls.setLevel(id);
      const lvl = hls.levels.find((l) => l.id === id);
      flashNotice(lvl ? lvl.label : 'Auto');
      setMenu(null);
    },
    [flashNotice, hls],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const wrap = wrapRef.current;
      if (!wrap) return;
      // Only react when focus is inside the player or the pointer is over it.
      // This avoids hijacking Space / arrows while the user is reading or
      // interacting with other parts of the page.
      const focused =
        wrap.contains(document.activeElement) && document.activeElement !== document.body;
      if (!focused && !pointerInsideRef.current) {
        return;
      }
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          revealControls();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          revealControls();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          revealControls();
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          seekBy(-10);
          revealControls();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          seekBy(10);
          revealControls();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((videoRef.current?.volume ?? 0) + 0.1);
          revealControls();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((videoRef.current?.volume ?? 0) - 0.1);
          revealControls();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          revealControls();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          void toggleFs();
          break;
        case 'c':
        case 'C': {
          e.preventDefault();
          if (tracks.length > 0) {
            const next = prefs.captionsLang ? null : (tracks[0].lang ?? tracks[0].label ?? null);
            selectCaptions(next);
          }
          break;
        }
        case 'p':
        case 'P':
          e.preventDefault();
          void togglePip();
          break;
        case '<':
        case ',':
          e.preventDefault();
          setRate(Math.max(0.25, (videoRef.current?.playbackRate ?? 1) - 0.25));
          break;
        case '>':
        case '.':
          e.preventDefault();
          setRate(Math.min(4, (videoRef.current?.playbackRate ?? 1) + 0.25));
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          const v = videoRef.current;
          if (!v || !Number.isFinite(v.duration)) break;
          e.preventDefault();
          const pct = Number(e.key) / 10;
          seekTo(v.duration * pct);
          revealControls();
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    togglePlay,
    seekBy,
    seekTo,
    setVolume,
    toggleMute,
    toggleFs,
    togglePip,
    setRate,
    revealControls,
    tracks,
    prefs.captionsLang,
    selectCaptions,
  ]);

  // ── Scrub bar interaction ──────────────────────────────────────────
  const pctFromClientX = useCallback((clientX: number) => {
    const bar = scrubBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const onScrubPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const bar = scrubBarRef.current;
      if (!bar || !duration) return;
      bar.setPointerCapture(e.pointerId);
      setScrubbing(true);
      const pct = pctFromClientX(e.clientX);
      setScrubPreviewSec(pct * duration);
      setScrubPreviewPct(pct);
      seekTo(pct * duration);
    },
    [duration, pctFromClientX, seekTo],
  );
  const onScrubPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!duration) return;
      const pct = pctFromClientX(e.clientX);
      setScrubPreviewSec(pct * duration);
      setScrubPreviewPct(pct);
      if (scrubbing) seekTo(pct * duration);
    },
    [duration, pctFromClientX, scrubbing, seekTo],
  );
  const onScrubPointerUp = useCallback((e: React.PointerEvent) => {
    scrubBarRef.current?.releasePointerCapture(e.pointerId);
    setScrubbing(false);
  }, []);
  const onScrubPointerLeave = useCallback(() => {
    if (!scrubbing) setScrubPreviewSec(null);
  }, [scrubbing]);

  // ── Gesture: tap / double-tap on video surface ─────────────────────
  const onSurfacePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const third = rect.width / 3;
      const side: 'left' | 'right' | 'center' =
        x < third ? 'left' : x > rect.width - third ? 'right' : 'center';
      const now = Date.now();
      const prev = lastTapRef.current;
      if (prev && prev.side === side && now - prev.ts < DOUBLE_TAP_WINDOW_MS) {
        // Double-tap confirmed — cancel any pending single-tap and handle seek.
        lastTapRef.current = null;
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        if (side === 'left') seekBy(-SKIP_SECONDS);
        else if (side === 'right') seekBy(SKIP_SECONDS);
        else togglePlay();
        return;
      }
      lastTapRef.current = { side, ts: now };
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        if (lastTapRef.current && lastTapRef.current.ts === now) {
          lastTapRef.current = null;
          if (side === 'center') togglePlay();
          else revealControls();
        }
      }, DOUBLE_TAP_WINDOW_MS);
    },
    [seekBy, togglePlay, revealControls],
  );

  // ── Derived display ────────────────────────────────────────────────
  const progressPct = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return (current / duration) * 100;
  }, [current, duration]);
  const bufferedPct = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, (bufferedEnd / duration) * 100);
  }, [bufferedEnd, duration]);

  const volumeIcon =
    prefs.muted || prefs.volume === 0 ? 'mute' : prefs.volume < 0.5 ? 'low' : 'high';

  const displayMode: 'showing' | 'hidden' =
    controlsVisible || !playing || scrubbing ? 'showing' : 'hidden';

  const hasCaptions = tracks.length > 0;
  const hasQuality = !hls.usingNative && hls.levels.length > 1;
  const showAirplayButton = airplayAvailable || isIosSafari();

  return (
    <div
      ref={wrapRef}
      className="vp-root"
      data-controls={displayMode}
      data-buffering={isBuffering ? 'true' : 'false'}
      data-started={started ? 'true' : 'false'}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
      }}
    >
      <video
        ref={videoRef}
        className="vp-video"
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
        poster={poster ?? undefined}
        aria-label={`Video player — ${title}`}
        controlsList="nodownload"
        x-webkit-airplay="allow"
        onClick={(e) => e.preventDefault()}
      />

      {/* Tap / double-tap gesture surface — visual only. Play/pause + seek
          are exposed by the control-bar buttons and keyboard shortcuts for
          AT users; this layer only handles touch/mouse gestures. */}
      <div
        className="vp-surface"
        onPointerUp={onSurfacePointerUp}
        role="presentation"
        aria-hidden="true"
      />

      {/* Seek flash zones */}
      <div
        className="vp-seek-flash vp-seek-flash-left"
        data-active={seekFlash === 'back' ? 'true' : 'false'}
        aria-hidden="true"
      >
        <span>−{SKIP_SECONDS}</span>
      </div>
      <div
        className="vp-seek-flash vp-seek-flash-right"
        data-active={seekFlash === 'fwd' ? 'true' : 'false'}
        aria-hidden="true"
      >
        <span>+{SKIP_SECONDS}</span>
      </div>

      {/* Center loading spinner */}
      <div
        className="vp-spinner"
        data-active={isBuffering && !fatalError ? 'true' : 'false'}
        aria-hidden="true"
      >
        <span className="vp-spinner-dot" style={{ animationDelay: '0ms' }} />
        <span className="vp-spinner-dot" style={{ animationDelay: '140ms' }} />
        <span className="vp-spinner-dot" style={{ animationDelay: '280ms' }} />
      </div>

      {/* Center play overlay before first start */}
      {!started && !fatalError ? (
        <button
          type="button"
          className="vp-start"
          onClick={() => {
            togglePlay();
          }}
          aria-label={`Play ${title}`}
        >
          <svg width="42" height="42" viewBox="0 0 42 42" fill="currentColor" aria-hidden="true">
            <path d="M13 8L33 21L13 34V8Z" />
          </svg>
        </button>
      ) : null}

      {/* Floating info FAB — always visible so recipients discover the
          details/queue panel even when the control bar is auto-hidden. */}
      {onOpenPanel ? (
        <button
          type="button"
          className="vp-info-fab"
          onClick={onOpenPanel}
          aria-label={panelOpen ? 'Close details panel' : 'Open details panel'}
          aria-pressed={panelOpen}
          data-active={panelOpen ? 'true' : 'false'}
        >
          <InfoIcon />
        </button>
      ) : null}

      {/* Overlay children (e.g. Up Next card) */}
      <div className="vp-overlay-top" data-visible={displayMode === 'showing' ? 'true' : 'false'}>
        {children}
      </div>

      {/* Notice toast */}
      {notice ? (
        <div className="vp-notice" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}

      {/* Error overlay */}
      {fatalError ? (
        <div className="vp-error" role="alert" aria-live="assertive">
          <p className="vp-error-msg">Playback failed.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              setFatalError(false);
              hls.recover();
              // On native HLS path, re-assign src so the video element refetches.
              if (hls.usingNative) {
                try {
                  v.src = src;
                } catch {
                  /* ignore */
                }
              }
              try {
                v.load();
                void v.play();
              } catch {
                /* ignore */
              }
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Control bar */}
      <div className="vp-controls" data-visible={displayMode === 'showing' ? 'true' : 'false'}>
        {/* Scrub bar */}
        <div className="vp-scrub-wrap">
          <div
            ref={scrubBarRef}
            className="vp-scrub"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration && duration > 0 ? duration : 100}
            aria-valuenow={duration ? current : 0}
            aria-valuetext={`${formatTimeLong(current)} of ${duration ? formatTimeLong(duration) : 'unknown'}`}
            tabIndex={0}
            onPointerDown={onScrubPointerDown}
            onPointerMove={onScrubPointerMove}
            onPointerUp={onScrubPointerUp}
            onPointerLeave={onScrubPointerLeave}
            onKeyDown={(e) => {
              if (!duration) return;
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                seekBy(-5);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                seekBy(5);
              } else if (e.key === 'Home') {
                e.preventDefault();
                seekTo(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                seekTo(duration - 1);
              }
            }}
          >
            <div className="vp-scrub-track" />
            <div className="vp-scrub-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="vp-scrub-played" style={{ width: `${progressPct}%` }} />
            <div className="vp-scrub-thumb" style={{ left: `${progressPct}%` }} />
            {scrubPreviewSec !== null ? (
              <div className="vp-scrub-preview" style={{ left: `${scrubPreviewPct * 100}%` }}>
                {formatTime(scrubPreviewSec)}
              </div>
            ) : null}
          </div>
        </div>

        {/* Button row */}
        <div className="vp-row">
          <button
            type="button"
            className="vp-btn vp-btn-primary"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="3" y="2" width="4" height="14" rx="1" />
                <rect x="11" y="2" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M4 2.5L15 9L4 15.5V2.5Z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="vp-btn"
            onClick={() => seekBy(-SKIP_SECONDS)}
            aria-label={`Rewind ${SKIP_SECONDS} seconds`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 5V1L7 6l5 5V7a6 6 0 11-6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x="12"
                y="17"
                textAnchor="middle"
                fontSize="7"
                fill="currentColor"
                fontFamily="JetBrains Mono, monospace"
              >
                10
              </text>
            </svg>
          </button>

          <button
            type="button"
            className="vp-btn"
            onClick={() => seekBy(SKIP_SECONDS)}
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 5V1l5 5-5 5V7a6 6 0 106 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x="12"
                y="17"
                textAnchor="middle"
                fontSize="7"
                fill="currentColor"
                fontFamily="JetBrains Mono, monospace"
              >
                10
              </text>
            </svg>
          </button>

          {/* Volume (desktop only via media query) */}
          <div className="vp-volume">
            <button
              type="button"
              className="vp-btn"
              onClick={toggleMute}
              aria-label={prefs.muted ? 'Unmute' : 'Mute'}
            >
              <VolumeIcon kind={volumeIcon} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={prefs.muted ? 0 : prefs.volume}
              onChange={(e) => setVolume(Number(e.currentTarget.value))}
              aria-label="Volume"
              className="vp-volume-slider"
            />
          </div>

          <div className="vp-time" aria-live="off">
            <span>{formatTime(current)}</span>
            <span className="vp-time-sep">/</span>
            <span>{duration ? formatTime(duration) : '--:--'}</span>
          </div>

          <span className="vp-spacer" />

          {/* Playback rate */}
          <div className="vp-menu-host">
            <button
              type="button"
              className="vp-btn vp-btn-text"
              onClick={() => setMenu((m) => (m === 'rate' ? null : 'rate'))}
              aria-haspopup="menu"
              aria-expanded={menu === 'rate'}
              aria-label="Playback speed"
            >
              {prefs.rate}×
            </button>
            {menu === 'rate' ? (
              <div className="vp-menu" role="menu">
                {RATE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    role="menuitemradio"
                    aria-checked={r === prefs.rate}
                    onClick={() => {
                      setRate(r);
                      setMenu(null);
                    }}
                    className="vp-menu-item"
                  >
                    <span>{r}×</span>
                    {r === prefs.rate ? <CheckIcon /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Quality */}
          {hasQuality ? (
            <div className="vp-menu-host">
              <button
                type="button"
                className="vp-btn vp-btn-text"
                onClick={() => setMenu((m) => (m === 'quality' ? null : 'quality'))}
                aria-haspopup="menu"
                aria-expanded={menu === 'quality'}
                aria-label="Video quality"
              >
                {qualityLabel(hls.levels, hls.currentLevelId)}
              </button>
              {menu === 'quality' ? (
                <div className="vp-menu" role="menu">
                  {hls.levels.map((lvl) => (
                    <button
                      key={lvl.id}
                      role="menuitemradio"
                      aria-checked={lvl.id === hls.currentLevelId}
                      onClick={() => selectQuality(lvl.id)}
                      className="vp-menu-item"
                    >
                      <span>{lvl.label}</span>
                      {lvl.id === hls.currentLevelId ? <CheckIcon /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Captions */}
          {hasCaptions ? (
            <div className="vp-menu-host">
              <button
                type="button"
                className="vp-btn"
                onClick={() => setMenu((m) => (m === 'captions' ? null : 'captions'))}
                aria-haspopup="menu"
                aria-expanded={menu === 'captions'}
                aria-label="Subtitles and captions"
                aria-pressed={prefs.captionsLang !== null}
              >
                <CcIcon active={prefs.captionsLang !== null} />
              </button>
              {menu === 'captions' ? (
                <div className="vp-menu" role="menu">
                  <button
                    role="menuitemradio"
                    aria-checked={prefs.captionsLang === null}
                    onClick={() => selectCaptions(null)}
                    className="vp-menu-item"
                  >
                    <span>Off</span>
                    {prefs.captionsLang === null ? <CheckIcon /> : null}
                  </button>
                  {tracks.map((t) => {
                    const key = t.lang ?? t.label;
                    const checked = prefs.captionsLang === key;
                    return (
                      <button
                        key={t.id}
                        role="menuitemradio"
                        aria-checked={checked}
                        onClick={() => selectCaptions(key)}
                        className="vp-menu-item"
                      >
                        <span>{t.label}</span>
                        {checked ? <CheckIcon /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* PiP (hidden on touch; browsers gate) */}
          {typeof document !== 'undefined' &&
          'pictureInPictureEnabled' in document &&
          document.pictureInPictureEnabled ? (
            <button
              type="button"
              className="vp-btn vp-desktop-only"
              onClick={togglePip}
              aria-label={pipActive ? 'Exit picture-in-picture' : 'Picture-in-picture'}
              aria-pressed={pipActive}
            >
              <PipIcon />
            </button>
          ) : null}

          {/* AirPlay */}
          {showAirplayButton ? (
            <button type="button" className="vp-btn" onClick={triggerAirplay} aria-label="AirPlay">
              <AirplayIcon />
            </button>
          ) : null}

          {/* Info / side panel toggle */}
          {onOpenPanel ? (
            <button
              type="button"
              className="vp-btn"
              onClick={onOpenPanel}
              aria-label={panelOpen ? 'Close details panel' : 'Open details panel'}
              aria-pressed={panelOpen}
            >
              <InfoIcon />
            </button>
          ) : null}

          {/* Fullscreen */}
          <button
            type="button"
            className="vp-btn"
            onClick={toggleFs}
            aria-label={fsActive ? 'Exit fullscreen' : 'Fullscreen'}
            aria-pressed={fsActive}
          >
            {fsActive ? <FsExitIcon /> : <FsIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Icon components (neutral, tiny) ─────────────────────────────────

function VolumeIcon({ kind }: { kind: 'mute' | 'low' | 'high' }) {
  if (kind === 'mute') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M2 7v4h3l4 3V4L5 7H2z" fill="currentColor" />
        <path
          d="M12 6l4 6M16 6l-4 6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 7v4h3l4 3V4L5 7H2z" fill="currentColor" />
      <path d="M12 6.5a3 3 0 010 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {kind === 'high' ? (
        <path
          d="M14 4.5a6 6 0 010 9"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

function CcIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect
        x="1.5"
        y="3.5"
        width="15"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
        fill={active ? 'currentColor' : 'none'}
      />
      <path
        d="M6 8.5a1.5 1.5 0 012.6-1M11 8.5a1.5 1.5 0 012.6-1"
        stroke={active ? 'var(--np-bg)' : 'currentColor'}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="15"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect x="9" y="8" width="7" height="5" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function AirplayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M2 3h14v8h-3M2 3v8h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M6 16l3-4 3 4H6z" fill="currentColor" />
    </svg>
  );
}

function FsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M2 6V2h4M16 6V2h-4M2 12v4h4M16 12v4h-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FsExitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M6 2v4H2M12 2v4h4M6 16v-4H2M12 16v-4h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 8v4M9 6v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2 6.5L5 9.5L10 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function qualityLabel(levels: HlsLevel[], currentId: number): string {
  if (currentId === -1 || levels.length === 0) return 'Auto';
  const match = levels.find((l) => l.id === currentId);
  return match?.label ?? 'Auto';
}
