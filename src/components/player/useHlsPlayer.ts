'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface HlsLevel {
  id: number;
  height: number | null;
  bitrate: number;
  label: string;
}

interface HlsLevelRaw {
  height?: number;
  bitrate?: number;
}

interface HlsInstance {
  levels: HlsLevelRaw[];
  currentLevel: number;
  loadSource: (url: string) => void;
  attachMedia: (el: HTMLVideoElement) => void;
  startLoad: () => void;
  recoverMediaError: () => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

export interface HlsController {
  levels: HlsLevel[];
  currentLevelId: number;
  setLevel: (id: number) => void;
  recover: () => void;
  usingNative: boolean;
}

function formatLevel(lv: HlsLevelRaw): string {
  if (lv.height) return `${lv.height}p`;
  if (lv.bitrate) return `${Math.round(lv.bitrate / 1000)} kbps`;
  return 'Unknown';
}

export function useHlsPlayer(video: HTMLVideoElement | null, src: string): HlsController {
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  const [currentLevelId, setCurrentLevelId] = useState(-1);
  const [usingNative, setUsingNative] = useState(false);
  const hlsRef = useRef<HlsInstance | null>(null);

  useEffect(() => {
    if (!video || !src) return;

    // Native HLS (iOS Safari, desktop Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      setUsingNative(true);
      setLevels([]);
      return () => {
        try {
          video.removeAttribute('src');
          video.load();
        } catch {
          /* ignore */
        }
      };
    }

    setUsingNative(false);
    let cancelled = false;

    void import('hls.js').then((mod) => {
      if (cancelled) return;
      const Hls = mod.default;
      if (!Hls.isSupported()) return;

      const inst = new Hls({
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        capLevelToPlayerSize: true,
        enableWorker: true,
        abrEwmaFastLive: 3,
        abrEwmaSlowLive: 9,
      }) as unknown as HlsInstance;

      inst.loadSource(src);
      inst.attachMedia(video);

      inst.on(Hls.Events.MANIFEST_PARSED, () => {
        const out: HlsLevel[] = [
          { id: -1, height: null, bitrate: 0, label: 'Auto' },
          ...inst.levels.map((lv, i) => ({
            id: i,
            height: lv.height ?? null,
            bitrate: lv.bitrate ?? 0,
            label: formatLevel(lv),
          })),
        ];
        setLevels(out);
      });

      inst.on(Hls.Events.LEVEL_SWITCHED, (_evt: unknown, data: unknown) => {
        if (data && typeof data === 'object' && 'level' in data) {
          const lvl = (data as { level: number }).level;
          setCurrentLevelId(typeof lvl === 'number' ? lvl : -1);
        }
      });

      inst.on(Hls.Events.ERROR, (_evt: unknown, data: unknown) => {
        if (!data || typeof data !== 'object') return;
        const d = data as { fatal?: boolean; type?: string };
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try {
            inst.startLoad();
          } catch {
            /* ignore */
          }
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            inst.recoverMediaError();
          } catch {
            /* ignore */
          }
        }
      });

      hlsRef.current = inst;
    });

    return () => {
      cancelled = true;
      try {
        hlsRef.current?.destroy();
      } catch {
        /* ignore */
      }
      hlsRef.current = null;
      setLevels([]);
      setCurrentLevelId(-1);
    };
  }, [video, src]);

  const setLevel = useCallback((id: number) => {
    const inst = hlsRef.current;
    if (!inst) return;
    inst.currentLevel = id;
    setCurrentLevelId(id);
  }, []);

  const recover = useCallback(() => {
    const inst = hlsRef.current;
    if (!inst) return;
    try {
      inst.startLoad();
    } catch {
      /* ignore */
    }
    try {
      inst.recoverMediaError();
    } catch {
      /* ignore */
    }
  }, []);

  return { levels, currentLevelId, setLevel, recover, usingNative };
}
