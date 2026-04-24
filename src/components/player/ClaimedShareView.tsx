'use client';

import { useEffect, useRef, useState } from 'react';

import { ShareWatcher } from './ShareWatcher';
import {
  AmbientBackdrop,
  FrameBrackets,
  PosterCard,
  TypewriterTitle,
} from '@/components/ui/transmission';

type MediaType = 'movie' | 'episode' | 'show';

export interface ClaimedShareViewProps {
  linkId: string;
  title: string;
  mediaType: MediaType;
  rootRatingKey: string;
  senderLabel: string | null;
  recipientLabel: string;
  ttlLabel: string;
  posterSrc: string | null;
  hasResume: boolean;
}

const SWIPE_THRESHOLD_PX = 30;
const SWIPE_TIMEOUT_MS = 500;

export function ClaimedShareView({
  linkId,
  title,
  mediaType,
  rootRatingKey,
  senderLabel,
  recipientLabel,
  ttlLabel,
  posterSrc,
  hasResume,
}: ClaimedShareViewProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  // Mount ShareWatcher lazily on first open — avoids kicking off episode
  // fetches / HLS prep before the user has asked to watch. Once mounted we
  // keep it in the tree so collapse/expand preserves playback state.
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (open && !mounted) setMounted(true);
  }, [open, mounted]);

  useEffect(() => {
    if (open && drawerRef.current) {
      drawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [open]);

  const onTouchStart = (e: React.TouchEvent): void => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent): void => {
    const start = touchStart.current;
    if (!start) return;
    touchStart.current = null;
    const end = e.changedTouches[0];
    if (!end) return;
    const dy = end.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > SWIPE_TIMEOUT_MS) return;
    if (Math.abs(dy) < SWIPE_THRESHOLD_PX) return;
    setOpen(dy < 0);
  };

  const ctaLabel = hasResume ? 'Continue watching' : 'Watch';

  return (
    <main className="min-h-screen bg-np-bg text-np-fg safe-top safe-bottom safe-x relative overflow-x-hidden">
      <AmbientBackdrop posterUrl={posterSrc} kenBurns loading="eager" />

      {/* Hero — same layout as the unclaimed screen */}
      <section
        className="relative flex flex-col min-h-screen max-w-lg mx-auto w-full px-4 sm:px-6 py-8"
        style={{ zIndex: 3 }}
      >
        <header className="mb-6 flex items-center justify-between animate-enter">
          <p className="text-np-green font-mono text-xs uppercase tracking-widest">airplex</p>
          <span className="badge">share</span>
        </header>

        <div className="relative flex-1 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-sm">
            <FrameBrackets />
            <div className="frame-scan" aria-hidden="true" />
            <div className="relative flex flex-col items-center gap-5 p-6" style={{ zIndex: 3 }}>
              <PosterCard
                posterUrl={posterSrc}
                title={title}
                aspect="3/4"
                loading="eager"
                width={240}
                height={360}
                className="w-full max-w-[240px] animate-enter-delay-1"
              />

              {senderLabel ? (
                <p className="text-np-cyan font-mono text-xs uppercase tracking-widest animate-enter-delay-1">
                  From <span className="text-np-fg">{senderLabel}</span>
                </p>
              ) : null}

              <TypewriterTitle
                text={title}
                maxChars={40}
                as="h1"
                className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-np-fg leading-tight text-center animate-enter-delay-2"
              />

              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="btn-play w-full animate-enter-delay-3"
                aria-controls="share-watch-drawer"
                aria-expanded={open}
                aria-label={`${ctaLabel}: ${title}`}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M3 2.5L13 8L3 13.5V2.5Z" />
                </svg>
                {ctaLabel}
              </button>
            </div>
          </div>

          <p className="mt-5 text-np-muted font-mono text-xs text-center animate-enter-delay-3">
            for <span className="text-np-cyan">{recipientLabel}</span> ·{' '}
            <span className="text-np-fg">{ttlLabel}</span>
          </p>
        </div>
      </section>

      {/* Watch drawer */}
      <section
        id="share-watch-drawer"
        ref={drawerRef}
        className="relative max-w-5xl mx-auto px-4 sm:px-6 pb-10"
        style={{ zIndex: 3 }}
        aria-label="Watch drawer"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          aria-label={open ? 'Hide player' : 'Show player'}
          aria-expanded={open}
          className="w-full flex flex-col items-center gap-2 py-4 text-np-muted hover:text-np-cyan transition-colors"
          style={{ minHeight: 48 }}
        >
          <span
            aria-hidden="true"
            className="block rounded-full bg-current"
            style={{ width: 44, height: 4, opacity: 0.5 }}
          />
          <span className="font-mono text-[11px] uppercase tracking-widest">
            {open ? 'Hide player' : 'Swipe up or tap to watch'}
          </span>
        </button>

        <div
          className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
          style={{
            maxHeight: open ? 5000 : 0,
            opacity: open ? 1 : 0,
          }}
          aria-hidden={!open}
        >
          {mounted ? (
            <div className="animate-enter-delay-1">
              <ShareWatcher
                linkId={linkId}
                title={title}
                mediaType={mediaType}
                rootRatingKey={rootRatingKey}
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
