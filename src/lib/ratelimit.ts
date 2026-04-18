/**
 * In-memory token-bucket rate limiter.
 *
 * Single-process only — documented, not fixed (plan §G). Used by middleware
 * (C1) for per-IP caps on `/api/hls/*` (60/min) and `/s/*` (30/min), and by
 * admin API routes for login throttling.
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Deduct one token from the bucket keyed by `key`. Returns true if a token
 * was available (and the caller may proceed), false if the caller is throttled.
 *
 * @param key           stable per-client key (e.g. `hls:${ip}`)
 * @param capacity      max tokens the bucket can hold
 * @param refillPerSec  tokens added per second of wall-clock time
 */
export function rateLimit(key: string, capacity: number, refillPerSec: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  let bucket: Bucket;
  if (existing === undefined) {
    bucket = { tokens: capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  } else {
    bucket = existing;
    const elapsed = Math.max(0, now - bucket.lastRefillMs) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
    bucket.lastRefillMs = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/**
 * Test-only reset of the module-level bucket map. Not exported from the
 * public barrel; tests import directly.
 */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
