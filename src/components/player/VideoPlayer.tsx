'use client';

import { useEffect, useRef } from 'react';
import { AirplayHint } from './AirplayHint';

export interface VideoPlayerProps {
  linkId: string;
  title: string;
  hlsUrl: string;
}

export function VideoPlayer({ linkId, title, hlsUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // If native HLS is supported (Safari / iOS), the src attribute on <video> handles it.
    // For other browsers, attach hls.js dynamically.
    if (!video.canPlayType('application/vnd.apple.mpegurl')) {
      let hlsInstance: {
        loadSource: (url: string) => void;
        attachMedia: (el: HTMLVideoElement) => void;
        destroy: () => void;
      } | null = null;
      let cancelled = false;

      import('hls.js').then((mod) => {
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
    }
  }, [hlsUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function startPing() {
      pingIntervalRef.current = setInterval(() => {
        void fetch(`/api/hls/${linkId}/ping`, { method: 'POST' });
      }, 30_000);
    }

    function stopPing() {
      if (pingIntervalRef.current !== null) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    }

    video.addEventListener('play', startPing);
    video.addEventListener('pause', stopPing);
    video.addEventListener('ended', stopPing);

    return () => {
      video.removeEventListener('play', startPing);
      video.removeEventListener('pause', stopPing);
      video.removeEventListener('ended', stopPing);
      stopPing();
    };
  }, [linkId]);

  return (
    <div className="flex flex-col gap-2">
      <h1
        className="text-2xl font-display uppercase tracking-widest"
        style={{ color: 'var(--np-cyan)' }}
      >
        {title}
      </h1>
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
