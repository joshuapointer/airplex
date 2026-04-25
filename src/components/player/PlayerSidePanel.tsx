'use client';

import { useEffect, useRef, useState } from 'react';

import { MetadataTab } from './MetadataTab';
import { QueueTab } from './QueueTab';
import type { PlayerMetadata } from '@/lib/player-metadata';

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
  episodeCount: number | null;
  episodes: QueueEpisode[];
}

interface QueueData {
  show: { ratingKey: string; title: string; summary: string | null };
  seasons: QueueSeason[];
}

export interface PlayerSidePanelProps {
  open: boolean;
  onClose: () => void;
  linkId: string;
  ratingKey: string;
  kind: 'movie' | 'episode' | 'show';
  queue: QueueData | null;
  resumeMap?: Record<string, number>;
  onSelectEpisode: (ratingKey: string) => void;
}

type TabKey = 'metadata' | 'queue';

const TAB_IDS: Record<TabKey, string> = {
  metadata: 'player-panel-tab-metadata',
  queue: 'player-panel-tab-queue',
};
const PANEL_ID = 'player-panel-body';

export function PlayerSidePanel({
  open,
  onClose,
  linkId,
  ratingKey,
  kind,
  queue,
  resumeMap,
  onSelectEpisode,
}: PlayerSidePanelProps) {
  const [tab, setTab] = useState<TabKey>('metadata');
  // In portrait the panel is always inline-visible below the player, so AT
  // must see it regardless of the `open` drawer prop.
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(orientation: portrait)');
    const sync = () => setIsPortrait(mql.matches);
    sync();
    mql.addEventListener?.('change', sync);
    return () => mql.removeEventListener?.('change', sync);
  }, []);
  const [meta, setMeta] = useState<PlayerMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  // Tracks the last rating key we fetched so re-opens / sibling prop changes
  // don't retrigger the fetch when we already have the data.
  const fetchedKeyRef = useRef<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const metadataTabRef = useRef<HTMLButtonElement>(null);
  const queueTabRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  // Element that was focused immediately before the panel opened; restored
  // on close so keyboard users return to the info button / control bar.
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Fetch metadata whenever the rating key changes. We don't gate on
  // `open` because portrait mode renders the panel inline below the
  // player (always visible) — only the landscape drawer hides until
  // toggled. Skip if we already have data for this key.
  useEffect(() => {
    if (fetchedKeyRef.current === ratingKey) return;

    const controller = new AbortController();
    setMetaLoading(true);
    setMetaError(null);

    (async () => {
      try {
        const res = await fetch(`/api/hls/${linkId}/metadata?rk=${encodeURIComponent(ratingKey)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PlayerMetadata;
        if (controller.signal.aborted) return;
        fetchedKeyRef.current = ratingKey;
        setMeta(json);
      } catch (err) {
        if (controller.signal.aborted) return;
        setMetaError(err instanceof Error ? err.message : 'Failed to load details');
      } finally {
        if (!controller.signal.aborted) setMetaLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, linkId, ratingKey]);

  // Reset tab to metadata when closing.
  useEffect(() => {
    if (!open) setTab('metadata');
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap — only when we're rendered as a drawer (landscape) with the
  // panel open. Portrait mode is an inline section, so normal document
  // tab order applies.
  useEffect(() => {
    if (!open || isPortrait) return;
    const aside = asideRef.current;
    if (!aside) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = aside.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    aside.addEventListener('keydown', onKey);
    return () => aside.removeEventListener('keydown', onKey);
  }, [open, isPortrait]);

  // Focus management: move focus into the panel on open (close button — the
  // least-destructive anchor), restore prior focus on close. Skip the first
  // mount so the page's own focus order isn't clobbered.
  useEffect(() => {
    if (open) {
      prevFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
      // Defer to after the panel actually paints the open state so the focus
      // ring is visible, not swallowed by the slide-in animation.
      const t = window.setTimeout(() => closeBtnRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
    // Restore only if we had a previous focus and it's still connected.
    const prev = prevFocusRef.current;
    if (prev && document.body.contains(prev)) {
      prev.focus();
    }
    return undefined;
  }, [open]);

  // Roving-tabindex keyboard nav across the tab strip (WAI-ARIA APG).
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tab === 'metadata' ? 'queue' : 'metadata';
      setTab(next);
      (next === 'metadata' ? metadataTabRef : queueTabRef).current?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTab('metadata');
      metadataTabRef.current?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setTab('queue');
      queueTabRef.current?.focus();
    }
  };

  return (
    <>
      {/* Backdrop scrim — only visible on mobile landscape where the panel
          is a full overlay. Keyboard-reachable close affordance. */}
      <div
        className="player-panel-scrim"
        data-open={open ? 'true' : 'false'}
        role="button"
        aria-label="Close panel"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <aside
        ref={asideRef}
        className="player-side-panel"
        data-open={open ? 'true' : 'false'}
        /* Panel is always inline-visible in portrait — expose it to AT in
           that mode regardless of the `open` drawer prop. Landscape uses
           the drawer state. */
        aria-hidden={isPortrait || open ? undefined : true}
        role="complementary"
        aria-label="Details and queue"
      >
        <header className="player-panel-header">
          <div className="player-panel-tabs" role="tablist" aria-label="Panel sections">
            <button
              ref={metadataTabRef}
              type="button"
              role="tab"
              id={TAB_IDS.metadata}
              aria-selected={tab === 'metadata'}
              aria-controls={PANEL_ID}
              tabIndex={tab === 'metadata' ? 0 : -1}
              onClick={() => setTab('metadata')}
              onKeyDown={onTabKeyDown}
              className={`player-panel-tab${tab === 'metadata' ? ' active' : ''}`}
            >
              Details
            </button>
            <button
              ref={queueTabRef}
              type="button"
              role="tab"
              id={TAB_IDS.queue}
              aria-selected={tab === 'queue'}
              aria-controls={PANEL_ID}
              tabIndex={tab === 'queue' ? 0 : -1}
              onClick={() => setTab('queue')}
              onKeyDown={onTabKeyDown}
              className={`player-panel-tab${tab === 'queue' ? ' active' : ''}`}
            >
              {kind === 'movie' ? 'Related' : 'Queue'}
            </button>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="player-panel-close"
            onClick={onClose}
            aria-label="Close details panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div
          className="player-panel-body"
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={TAB_IDS[tab]}
          tabIndex={0}
        >
          {tab === 'metadata' ? (
            <MetadataTab data={meta} loading={metaLoading} error={metaError} />
          ) : (
            <QueueTab
              kind={kind}
              currentRatingKey={ratingKey}
              queue={queue}
              loading={queue === null && kind !== 'movie'}
              resumeMap={resumeMap}
              onSelect={(rk) => {
                onSelectEpisode(rk);
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}
