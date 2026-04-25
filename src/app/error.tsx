'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--np-bg)', color: 'var(--np-fg)' }}
    >
      <div className="glass w-full max-w-sm p-8 flex flex-col gap-6">
        {/* Brand */}
        <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--np-cyan)' }}>
          airPointer
        </p>

        {/* Icon */}
        <div aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: 'var(--np-magenta)' }}
          >
            <circle cx="18" cy="18" r="17" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M18 10v10M18 26v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Heading */}
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl uppercase tracking-wide leading-tight">
            Something went wrong
          </h1>
          <p className="font-mono text-sm" style={{ color: 'var(--np-muted)' }}>
            An unexpected error occurred. You can try again or reload the page.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs" style={{ color: 'var(--np-text-faint)' }}>
              Error ID: {error.digest}
            </p>
          ) : null}
        </div>

        {/* Action */}
        <button type="button" onClick={reset} className="btn-primary w-full">
          Try again
        </button>
      </div>
    </main>
  );
}
