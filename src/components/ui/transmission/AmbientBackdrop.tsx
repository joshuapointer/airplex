import type { CSSProperties } from 'react';

export interface AmbientBackdropProps {
  /** Absolute or relative URL. If null/undefined, renders nothing. */
  posterUrl?: string | null;
  /** Defaults to true. Set false on admin pages where LCP contention matters. */
  kenBurns?: boolean;
  /** Defaults to 'eager' on pre-claim recipient, 'lazy' on admin. */
  loading?: 'eager' | 'lazy';
  /** Extra opacity override (0–1). Defaults to var(--np-ambient-opacity). */
  opacity?: number;
}

export function AmbientBackdrop({
  posterUrl,
  kenBurns = true,
  loading,
  opacity,
}: AmbientBackdropProps) {
  if (!posterUrl) return null;

  const classes = ['ambient-backdrop'];
  if (kenBurns) classes.push('backdrop-kenburns');

  const style: CSSProperties = { backgroundImage: `url(${posterUrl})` };
  if (typeof opacity === 'number') {
    style.opacity = opacity;
  }

  return (
    <div
      aria-hidden="true"
      className={classes.join(' ')}
      style={style}
      data-lazy={loading === 'lazy' ? 'true' : undefined}
    />
  );
}
