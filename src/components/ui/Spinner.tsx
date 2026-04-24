import type { CSSProperties } from 'react';

export interface SpinnerProps {
  /**
   * `dots` — three bouncing dots (np-breathe animation).
   * `inline` — plain "Loading…" text marker.
   */
  variant?: 'dots' | 'inline';
  /** Visible text after the dots (e.g. "Loading episodes…"). */
  label?: string;
  /** Make the label visually hidden but still exposed to AT. */
  srOnlyLabel?: boolean;
  className?: string;
}

const DOT_STYLE: CSSProperties = {
  width: '0.375rem',
  height: '0.375rem',
  borderRadius: '9999px',
};

/**
 * Shared loading indicator. Extracted from the hand-rolled dot instances
 * scattered across ShareWatcher / MetadataTab / QueueTab so every surface
 * matches the same cadence + reduced-motion behaviour.
 */
export function Spinner({
  variant = 'dots',
  label,
  srOnlyLabel = false,
  className = '',
}: SpinnerProps) {
  if (variant === 'inline') {
    return (
      <span
        className={`font-mono text-sm text-np-muted ${className}`}
        role="status"
        aria-live="polite"
      >
        {label ?? 'Loading…'}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block bg-np-muted"
        style={{ ...DOT_STYLE, animation: 'np-breathe 1.2s ease-in-out 0ms infinite' }}
        aria-hidden="true"
      />
      <span
        className="inline-block bg-np-muted"
        style={{ ...DOT_STYLE, animation: 'np-breathe 1.2s ease-in-out 200ms infinite' }}
        aria-hidden="true"
      />
      <span
        className="inline-block bg-np-muted"
        style={{ ...DOT_STYLE, animation: 'np-breathe 1.2s ease-in-out 400ms infinite' }}
        aria-hidden="true"
      />
      {label ? (
        <span className={srOnlyLabel ? 'sr-only' : 'font-mono text-xs text-np-muted'}>{label}</span>
      ) : null}
    </span>
  );
}
