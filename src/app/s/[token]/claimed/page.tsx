import type { Metadata } from 'next';

import { FrameBrackets } from '@/components/ui/transmission';

export const metadata: Metadata = {
  title: 'airPointer — already claimed',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

export default function ClaimedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-np-bg text-np-fg safe-top safe-bottom safe-x">
      <div className="relative max-w-sm w-full">
        <FrameBrackets />
        <section
          className="glass w-full p-8 animate-enter relative"
          style={{ zIndex: 3 }}
          role="main"
          aria-labelledby="claimed-heading"
        >
          {/* Brand */}
          <p className="text-np-cyan font-mono text-xs uppercase tracking-widest mb-6">
            airPointer
          </p>

          {/* Icon mark — lock glyph reinforces "already claimed" semantics */}
          <div className="mb-5" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-np-cyan"
            >
              <rect
                x="3"
                y="7"
                width="10"
                height="7"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M5.5 7V5a2.5 2.5 0 015 0v2"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <circle cx="8" cy="10.5" r="0.75" fill="currentColor" />
            </svg>
          </div>

          {/* Heading */}
          <h1
            id="claimed-heading"
            className="font-display text-3xl uppercase tracking-wide text-np-fg mb-3 leading-tight"
          >
            Already claimed
          </h1>

          {/* Body */}
          <p className="font-mono text-sm text-np-muted leading-relaxed mb-4">
            Another device has already opened this share link. Each link is locked to the first
            device that uses it.
          </p>

          {/* Hint — what to do next */}
          <p
            className="font-mono text-xs leading-relaxed"
            style={{ color: 'var(--np-text-faint)' }}
          >
            Ask the sender to reset the device lock from their dashboard, or to send you a new link.
          </p>
          <p
            className="font-mono text-xs leading-relaxed mt-2"
            style={{ color: 'var(--np-text-faint)' }}
          >
            If you can&rsquo;t reach the sender, this link cannot be unlocked.
          </p>
        </section>
      </div>
    </main>
  );
}
