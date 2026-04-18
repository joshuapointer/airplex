import { describe, it, expect } from 'vitest';
import { createShareToken, verifyShareTokenSignature, hashShareToken } from '@/lib/share-token';

describe('share-token', () => {
  it('round-trip: created token verifies correctly', () => {
    const { token, tokenHash } = createShareToken();
    expect(verifyShareTokenSignature(token)).toBe(true);
    expect(tokenHash).toBe(hashShareToken(token));
  });

  it('token has expected two-part format', () => {
    const { token } = createShareToken();
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    // Each part is base64url of 16 bytes: ceil(16*4/3) = 22 chars (no padding)
    expect(parts[0]).toHaveLength(22);
    expect(parts[1]).toHaveLength(22);
  });

  it('token total length is ~45 chars', () => {
    const { token } = createShareToken();
    // 22 + '.' + 22 = 45
    expect(token.length).toBe(45);
  });

  it('tamper: flipping a char in the rand part fails verification', () => {
    const { token } = createShareToken();
    const parts = token.split('.');
    const rand = parts[0];
    // Replace middle char with a different base64url char to reliably change decoded bytes
    const idx = 10;
    const original = rand[idx];
    const replacement = original === 'A' ? 'B' : 'A';
    const tamperedRand = rand.slice(0, idx) + replacement + rand.slice(idx + 1);
    const tampered = `${tamperedRand}.${parts[1]}`;
    expect(verifyShareTokenSignature(tampered)).toBe(false);
  });

  it('tamper: flipping a char in the sig part fails verification', () => {
    const { token } = createShareToken();
    const parts = token.split('.');
    const sig = parts[1];
    // Replace middle char with a different base64url char to reliably change decoded bytes
    const idx = 10;
    const original = sig[idx];
    const replacement = original === 'A' ? 'B' : 'A';
    const tamperedSig = sig.slice(0, idx) + replacement + sig.slice(idx + 1);
    const tampered = `${parts[0]}.${tamperedSig}`;
    expect(verifyShareTokenSignature(tampered)).toBe(false);
  });

  it('tamper: swapping rand and sig fails verification', () => {
    const { token } = createShareToken();
    const parts = token.split('.');
    const swapped = `${parts[1]}.${parts[0]}`;
    expect(verifyShareTokenSignature(swapped)).toBe(false);
  });

  it('rejects tokens without a dot', () => {
    expect(verifyShareTokenSignature('nodothere')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(verifyShareTokenSignature('')).toBe(false);
  });

  it('uniqueness: 100 tokens are all distinct', () => {
    const tokens = Array.from({ length: 100 }, () => createShareToken().token);
    const unique = new Set(tokens);
    expect(unique.size).toBe(100);
  });

  it('hashShareToken returns 64-char hex string', () => {
    const { token } = createShareToken();
    const hash = hashShareToken(token);
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('tokenHash in IssuedShareToken matches hashShareToken(token)', () => {
    const { token, tokenHash } = createShareToken();
    expect(tokenHash).toBe(hashShareToken(token));
  });
});
