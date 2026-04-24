'use client';

import { useCallback, useEffect, useState } from 'react';

import { ShareWatcher } from './ShareWatcher';
import { ShareHero } from '@/components/ui/transmission';

type MediaType = 'movie' | 'episode' | 'show';

export interface ClaimedShareViewProps {
  linkId: string;
  title: string;
  mediaType: MediaType;
  rootRatingKey: string;
  senderLabel: string | null;
  recipientLabel: string;
  ttlLabel: string;
  ttlAccent?: 'default' | 'warn';
  posterSrc: string | null;
  hasResume: boolean;
}

const WATCH_STATE_MARKER = 'airpointer_watch';

type View = 'hero' | 'watching';

export function ClaimedShareView({
  linkId,
  title,
  mediaType,
  rootRatingKey,
  senderLabel,
  recipientLabel,
  ttlLabel,
  ttlAccent = 'default',
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
        <ShareHero
          title={title}
          mediaType={mediaType}
          rootRatingKey={rootRatingKey}
          senderLabel={senderLabel}
          recipientLabel={recipientLabel}
          ttlLabel={ttlLabel}
          ttlAccent={ttlAccent}
          posterSrc={posterSrc}
          cta={
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
          }
        />
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
