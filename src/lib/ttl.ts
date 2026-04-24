/** TTL formatting + pct helpers. Single source of truth. */

/** Short format for dense UI surfaces: "3d", "47h", "12m", "∞". */
export function formatTtlShort(remainingSec: number | null): string {
  if (remainingSec === null) return '∞';
  if (remainingSec <= 0) return '0m';
  const days = Math.floor(remainingSec / 86400);
  if (days >= 2) return `${days}d`;
  const hours = Math.floor(remainingSec / 3600);
  if (hours >= 1) return `${hours}h`;
  const mins = Math.max(1, Math.floor(remainingSec / 60));
  return `${mins}m`;
}

/** Long format for recipient-facing copy: "3 days", "no expiry". */
export function formatTtlLong(remainingSec: number | null): string {
  if (remainingSec === null) return 'no expiry';
  const h = Math.floor(remainingSec / 3600);
  const d = Math.floor(h / 24);
  if (d >= 2) return `${d} days`;
  if (h >= 1) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const m = Math.max(1, Math.floor(remainingSec / 60));
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** Percent remaining of the lifetime window, clamped [0,100]. */
export function computeTtlPct(createdAt: number, expiresAt: number, now: number): number {
  const span = expiresAt - createdAt;
  if (span <= 0) return 0;
  const raw = ((expiresAt - now) / span) * 100;
  return Math.max(0, Math.min(100, raw));
}
