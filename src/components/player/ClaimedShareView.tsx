'use client';

import { useCallback, useEffect, useState } from 'react';

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

const WATCH_STATE_MARKER = 'airplex_watch';

type View = 'hero' | 'watching';

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
  const [view, setView] = useState<View>('hero');

  // Mount ShareWatcher lazily on first entry into the watching view, then
  // keep it mounted so hopping between views preserves playback + fetch state.
  const [everWatched, setEverWatched] = useState(false);

  const enterWatching = useCallback(() => {
    if (typeof window !== 'undefined') {
      // Push a history entry tied to the same URL. The Back button / swipe
      // pops this entry without reloading, and the popstate handler below
      // returns us to the hero. Keeps the app a pure SPA — no route change.
      window.history.pushState({ [WATCH_STATE_MARKER]: true }, '', window.location.href);
    }
    setEverWatched(true);
    setView('watching');
  }, []);

  const exitWatching = useCallback(() => {
    if (typeof window !== 'undefined') {
      const s = window.history.state as Record<string, unknown> | null;
      if (s && s[WATCH_STATE_MARKER]) {
        window.history.back(); // triggers popstate which sets view='hero'
        return;
      }
    }
    setView('hero');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = (): void => {
      const s = window.history.state as Record<string, unknown> | null;
      if (s && s[WATCH_STATE_MARKER]) {
        // Still inside our pushed watch state — shouldn't happen because
        // popstate fires on pop, not push. Safe fallback: stay in watching.
        setView('watching');
      } else {
        setView('hero');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const ctaLabel = hasResume ? 'Continue watching' : 'Watch';
  const isWatching = view === 'watching';

  return (
    <main className="min-h-screen bg-np-bg text-np-fg safe-top safe-bottom safe-x relative overflow-x-hidden">
      {!isWatching ? (
        <>
          <AmbientBackdrop posterUrl={posterSrc} kenBurns loading="eager" />

          <section
            className="relative flex flex-col min-h-screen max-w-lg mx-auto w-full px-4 sm:px-6 py-8"
            style={{ zIndex: 3 }}
          >
            <header className="mb-6 flex items-center justify-between animate-enter">
              <p className="text-np-green font-mono text-xs uppercase tracking-widest">airPointer</p>
              <span className="badge">share</span>
            </header>

            <div className="relative flex-1 flex flex-col items-center justify-center">
              <div className="relative w-full max-w-sm">
                <FrameBrackets />
                <div className="frame-scan" aria-hidden="true" />
                <div
                  className="relative flex flex-col items-center gap-5 p-6"
                  style={{ zIndex: 3 }}
                >
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
                    onClick={enterWatching}
                    className="btn-play w-full animate-enter-delay-3"
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
        </>
      ) : null}

      {/* Watching view — mounted once and kept mounted so playback state
          survives hero↔watching transitions. Hidden via CSS when not active.
          Landscape: full-viewport Netflix-style player + right-drawer panel.
          Portrait: stacked player on top, panel content inline below. */}
      {everWatched ? (
        <section
          aria-hidden={!isWatching}
          className="watching-stage"
          data-active={isWatching ? 'true' : 'false'}
        >
          <div className="watching-topbar">
            <button
              type="button"
              onClick={exitWatching}
              className="btn-ghost text-xs"
              aria-label="Back to share home"
            >
              ← Back
            </button>
          </div>
          <div className="watching-body">
            <ShareWatcher
              linkId={linkId}
              title={title}
              mediaType={mediaType}
              rootRatingKey={rootRatingKey}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}
