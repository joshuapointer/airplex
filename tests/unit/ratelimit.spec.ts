import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimit, _resetRateLimitForTests } from '@/lib/ratelimit';

beforeEach(() => {
  _resetRateLimitForTests();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ratelimit: _resetRateLimitForTests', () => {
  it('clears all bucket state so keys start fresh', () => {
    // Exhaust the bucket for a key.
    const key = 'reset-test:ip';
    const capacity = 2;
    rateLimit(key, capacity, 1);
    rateLimit(key, capacity, 1);
    // Bucket is now at 0 — next call would be false.
    expect(rateLimit(key, capacity, 1)).toBe(false);

    // After reset the key should get a fresh bucket.
    _resetRateLimitForTests();
    expect(rateLimit(key, capacity, 1)).toBe(true);
  });
});

describe('ratelimit: initial capacity', () => {
  it('first call on a fresh key succeeds (starts with capacity tokens)', () => {
    expect(rateLimit('fresh:ip', 10, 1)).toBe(true);
  });

  it('can consume exactly `capacity` tokens before being throttled', () => {
    const key = 'cap-test:ip';
    const capacity = 3;
    expect(rateLimit(key, capacity, 0)).toBe(true);
    expect(rateLimit(key, capacity, 0)).toBe(true);
    expect(rateLimit(key, capacity, 0)).toBe(true);
    // 4th call exceeds capacity
    expect(rateLimit(key, capacity, 0)).toBe(false);
  });
});

describe('ratelimit: exhaustion', () => {
  it('returns false when all tokens are consumed', () => {
    const key = 'exhaust:ip';
    const capacity = 1;
    expect(rateLimit(key, capacity, 0)).toBe(true);
    expect(rateLimit(key, capacity, 0)).toBe(false);
    expect(rateLimit(key, capacity, 0)).toBe(false);
  });
});

describe('ratelimit: token refill over time', () => {
  it('refills tokens after advancing fake time', () => {
    vi.useFakeTimers();
    const key = 'refill:ip';
    const capacity = 5;
    const refillPerSec = 5; // 5 tokens per second

    // Consume all 5 tokens.
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, capacity, refillPerSec)).toBe(true);
    }
    // Now exhausted.
    expect(rateLimit(key, capacity, refillPerSec)).toBe(false);

    // Advance 1 second → 5 more tokens should refill.
    vi.advanceTimersByTime(1000);
    expect(rateLimit(key, capacity, refillPerSec)).toBe(true);
  });

  it('does not exceed capacity after over-filling', () => {
    vi.useFakeTimers();
    const key = 'overcap:ip';
    const capacity = 3;
    const refillPerSec = 3;

    // Consume 1 token.
    rateLimit(key, capacity, refillPerSec);

    // Advance 10 seconds — tokens should be capped at capacity (3), not 1 + 30.
    vi.advanceTimersByTime(10_000);

    // Should succeed 3 times and then fail.
    expect(rateLimit(key, capacity, refillPerSec)).toBe(true);
    expect(rateLimit(key, capacity, refillPerSec)).toBe(true);
    expect(rateLimit(key, capacity, refillPerSec)).toBe(true);
    expect(rateLimit(key, capacity, refillPerSec)).toBe(false);
  });
});

describe('ratelimit: key isolation', () => {
  it('different keys have independent buckets', () => {
    const capacity = 1;
    const keyA = 'iso:ipA';
    const keyB = 'iso:ipB';

    // Exhaust key A.
    expect(rateLimit(keyA, capacity, 0)).toBe(true);
    expect(rateLimit(keyA, capacity, 0)).toBe(false);

    // Key B is unaffected.
    expect(rateLimit(keyB, capacity, 0)).toBe(true);
  });

  it('exhausting one key does not affect another', () => {
    for (let i = 0; i < 10; i++) {
      rateLimit('spam:ip', 10, 0);
    }
    // A totally different key should still be fresh.
    expect(rateLimit('clean:ip', 5, 0)).toBe(true);
  });
});

describe('ratelimit: eviction of stale entries', () => {
  it('stale buckets are swept after 10 minutes of idle time', () => {
    vi.useFakeTimers();
    const EVICT_AFTER_MS = 10 * 60 * 1000; // must match module constant
    const SWEEP_INTERVAL = 500; // must match module constant

    const staleKey = 'stale:ip';
    const capacity = 5;

    // Create a bucket entry.
    rateLimit(staleKey, capacity, 1);

    // Advance time past the eviction threshold.
    vi.advanceTimersByTime(EVICT_AFTER_MS + 1);

    // Trigger enough calls to trip the sweep (SWEEP_INTERVAL calls).
    // After eviction the stale key gets a brand-new full bucket again.
    for (let i = 0; i < SWEEP_INTERVAL; i++) {
      rateLimit(`sweep-filler:${i}`, capacity, 1);
    }

    // The stale key should have been evicted and now gets a fresh bucket at
    // full capacity — meaning it can be consumed again from the top.
    expect(rateLimit(staleKey, capacity, 1)).toBe(true);
  });
});
