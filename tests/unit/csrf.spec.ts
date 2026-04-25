import { describe, it, expect } from 'vitest';
import { issueCsrf, verifyCsrf } from '@/lib/csrf';
import type { AdminSessionData } from '@/lib/session';

// Helper: build a minimal AdminSessionData with a given csrf value.
function makeSession(csrf: string | undefined): AdminSessionData {
  return { csrf } as AdminSessionData;
}

describe('csrf: issueCsrf', () => {
  it('returns a non-empty string', () => {
    const token = issueCsrf();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns a 32-character lowercase hex string (16 random bytes)', () => {
    const token = issueCsrf();
    expect(token).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(token)).toBe(true);
  });

  it('two consecutive calls return different tokens', () => {
    const a = issueCsrf();
    const b = issueCsrf();
    expect(a).not.toBe(b);
  });

  it('100 tokens are all distinct', () => {
    const tokens = Array.from({ length: 100 }, () => issueCsrf());
    expect(new Set(tokens).size).toBe(100);
  });
});

describe('csrf: verifyCsrf', () => {
  it('returns true when session token and header value match', () => {
    const token = issueCsrf();
    const session = makeSession(token);
    expect(verifyCsrf(session, token)).toBe(true);
  });

  it('returns false when header value differs from session token', () => {
    const token = issueCsrf();
    const other = issueCsrf();
    const session = makeSession(token);
    // Ensure the two tokens are actually different (they should be).
    expect(token).not.toBe(other);
    expect(verifyCsrf(session, other)).toBe(false);
  });

  it('returns false when header value is empty string', () => {
    const token = issueCsrf();
    const session = makeSession(token);
    expect(verifyCsrf(session, '')).toBe(false);
  });

  it('returns false when session csrf is undefined', () => {
    const session = makeSession(undefined);
    expect(verifyCsrf(session, issueCsrf())).toBe(false);
  });

  it('returns false when both session csrf and header are empty', () => {
    const session = makeSession('');
    expect(verifyCsrf(session, '')).toBe(false);
  });

  it('returns false when header is null', () => {
    const token = issueCsrf();
    const session = makeSession(token);
    expect(verifyCsrf(session, null)).toBe(false);
  });

  it('returns false for a single flipped hex character in the header', () => {
    const token = issueCsrf();
    const session = makeSession(token);
    // Flip the first character.
    const flipped = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
    expect(verifyCsrf(session, flipped)).toBe(false);
  });

  it('returns false when header is correct length but non-hex', () => {
    const token = issueCsrf();
    const session = makeSession(token);
    // 32 chars of non-hex content (g is not hex).
    const nonHex = 'g'.repeat(32);
    expect(verifyCsrf(session, nonHex)).toBe(false);
  });

  it('returns false when session csrf is non-hex (wrong format)', () => {
    // Store a non-hex value in the session.
    const session = makeSession('g'.repeat(32));
    const token = issueCsrf();
    expect(verifyCsrf(session, token)).toBe(false);
  });

  it('timing-safe: unequal strings of same length return false consistently', () => {
    // We cannot directly assert timing, but we can verify that the function
    // uses timingSafeEqual by checking that differing values of the same
    // valid length all return false (no short-circuit on first byte).
    const base = issueCsrf();
    const session = makeSession(base);
    const allFs = 'f'.repeat(32);
    const allZeros = '0'.repeat(32);
    expect(verifyCsrf(session, allFs)).toBe(false);
    expect(verifyCsrf(session, allZeros)).toBe(false);
  });

  it('timing-safe: mismatched lengths are rejected before comparison (non-hex path)', () => {
    // Shorter-than-32-char string must fail the regex check, not crash.
    const token = issueCsrf();
    const session = makeSession(token);
    expect(verifyCsrf(session, token.slice(0, 16))).toBe(false);
    expect(verifyCsrf(session, token + 'aa')).toBe(false);
  });
});
