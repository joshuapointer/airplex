'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="animate-enter flex flex-col items-start gap-6 py-8">
      {/* Icon + heading row */}
      <div className="flex items-center gap-3">
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: 'var(--np-magenta)', flexShrink: 0 }}
        >
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M10 5.5v5.5M10 13.5v.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <h1 className="font-display text-2xl uppercase tracking-wide" style={{ color: 'var(--np-magenta)' }}>
          Dashboard error
        </h1>
      </div>

      {/* Description */}
      <div className="glass p-6 w-full max-w-lg flex flex-col gap-3">
        <p className="font-mono text-sm" style={{ color: 'var(--np-muted)' }}>
          An error occurred while loading this section of the dashboard.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs" style={{ color: 'var(--np-text-faint)' }}>
            Error ID: {error.digest}
          </p>
        ) : null}
      </div>

      {/* Retry */}
      <button type="button" onClick={reset} className="btn-primary">
        Retry
      </button>
    </div>
  );
}
