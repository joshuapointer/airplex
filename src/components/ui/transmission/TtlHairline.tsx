import type { CSSProperties } from 'react';
import { computeTtlPct } from '@/lib/ttl';

const WARN_THRESHOLD_PCT = 10;

export interface TtlHairlineProps {
  /** Share created_at (unix seconds). */
  createdAt: number;
  /** Share expires_at (unix seconds). Null = never expires. */
  expiresAt: number | null;
  /** Server clock (Math.floor(Date.now()/1000)). */
  now: number;
  /** When true, renders a thinner variant (1px vs 2px). */
  compact?: boolean;
  className?: string;
}

export function TtlHairline({ createdAt, expiresAt, now, compact, className }: TtlHairlineProps) {
  if (expiresAt === null) return null;
  const pct = computeTtlPct(createdAt, expiresAt, now);

  const classes = ['ttl-hairline'];
  if (compact) classes.push('compact');
  if (className) classes.push(className);

  const style = { '--ttl-fill-pct': `${pct}%` } as CSSProperties;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={classes.join(' ')}
      data-warn={pct < WARN_THRESHOLD_PCT ? 'true' : undefined}
      style={style}
    />
  );
}
