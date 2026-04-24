import type { ReactNode } from 'react';

import { BrandFlicker } from '@/components/dashboard/BrandFlicker';

import { AmbientBackdrop } from './AmbientBackdrop';
import { FrameBrackets } from './FrameBrackets';
import { PosterCard } from './PosterCard';
import { TypewriterTitle } from './TypewriterTitle';

export interface ShareHeroProps {
  title: string;
  /** Used for aria-label on the poster + TypewriterTitle character cap keying. */
  mediaType: 'movie' | 'episode' | 'show';
  /** Root rating key — accepted for parity with upstream contract; unused visually. */
  rootRatingKey?: string;
  senderLabel: string | null;
  recipientLabel: string;
  ttlLabel: string;
  posterSrc: string | null;
  /** Primary CTA markup — claim form for unclaimed, enter-watching button for claimed. */
  cta: ReactNode;
  /**
   * Optional accent color for the TTL label (magenta when about to expire,
   * inherit otherwise). Color tokens only — no hex strings.
   */
  ttlAccent?: 'default' | 'warn';
  /** Extra hint after the TTL ("locks to device") — appended with · separator. */
  ttlHint?: string;
}

/**
 * Shared recipient hero block — used by both the unclaimed share page and
 * the claimed share view. Consolidates brand header, frame brackets, scan
 * sweep, poster card, typewriter title, sender/recipient footnote, and a
 * parent-supplied CTA into one component so the two flows stay in sync.
 */
export function ShareHero({
  title,
  senderLabel,
  recipientLabel,
  ttlLabel,
  posterSrc,
  cta,
  ttlAccent = 'default',
  ttlHint,
}: ShareHeroProps) {
  const fallbackSender = senderLabel ?? 'Shared with you via airPointer';
  return (
    <>
      <AmbientBackdrop posterUrl={posterSrc} kenBurns loading="eager" />

      <section
        className="relative flex flex-col min-h-screen max-w-lg mx-auto w-full px-4 sm:px-6 py-8"
        style={{ zIndex: 3 }}
      >
        <header className="mb-6 flex items-center justify-between animate-enter">
          <p className="text-np-cyan font-mono text-xs uppercase tracking-widest">
            <BrandFlicker>airPointer</BrandFlicker>
          </p>
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
                className="w-full animate-enter-delay-1"
              />

              {senderLabel ? (
                <p className="text-np-cyan font-mono text-xs uppercase tracking-widest animate-enter-delay-1">
                  From <span className="text-np-fg">{senderLabel}</span>
                </p>
              ) : (
                <p className="text-np-muted font-mono text-xs uppercase tracking-widest animate-enter-delay-1">
                  {fallbackSender}
                </p>
              )}

              <TypewriterTitle
                text={title}
                maxChars={40}
                as="h1"
                className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-np-fg leading-tight text-center animate-enter-delay-2"
              />

              {cta}
            </div>
          </div>

          <p className="mt-5 text-np-muted font-mono text-xs text-center animate-enter-delay-3">
            for <span className="text-np-cyan">{recipientLabel}</span> ·{' '}
            <span className={ttlAccent === 'warn' ? 'text-np-magenta' : 'text-np-fg'}>
              {ttlLabel}
            </span>
            {ttlHint ? <> · {ttlHint}</> : null}
          </p>
        </div>
      </section>
    </>
  );
}
