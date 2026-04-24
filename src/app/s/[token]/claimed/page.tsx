import type { Metadata } from 'next';

import { FrameBrackets } from '@/components/ui/transmission';

export const metadata: Metadata = {
  title: 'airplex — already claimed',
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
          <p className="text-np-cyan font-mono text-xs uppercase tracking-widest mb-6">airplex</p>

          {/* Icon mark */}
          <div className="mb-5" aria-hidden="true">
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-np-cyan"
            >
              <rect
                x="1"
                y="1"
                width="34"
                height="34"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M11 18h14M18 11l7 7-7 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
        </section>
      </div>
    </main>
  );
}
