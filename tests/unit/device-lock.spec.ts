import { describe, it, expect } from 'vitest';
import { cookieNameFor, computeDeviceFp, ironConfigFor } from '@/lib/device-lock';

describe('device-lock', () => {
  describe('cookieNameFor', () => {
    it('returns airplex_device_<linkId> for valid linkId', () => {
      expect(cookieNameFor('abc123')).toBe('airplex_device_abc123');
      expect(cookieNameFor('Link-ID_01')).toBe('airplex_device_Link-ID_01');
    });

    it('throws for linkId shorter than 6 chars', () => {
      expect(() => cookieNameFor('abc')).toThrow();
    });

    it('throws for linkId longer than 24 chars', () => {
      expect(() => cookieNameFor('a'.repeat(25))).toThrow();
    });

    it('throws for linkId with invalid chars (spaces, dots)', () => {
      expect(() => cookieNameFor('bad id')).toThrow();
      expect(() => cookieNameFor('bad.id')).toThrow();
    });

    it('accepts exactly 6 chars (lower bound)', () => {
      expect(cookieNameFor('abcdef')).toBe('airplex_device_abcdef');
    });

    it('accepts exactly 24 chars (upper bound)', () => {
      const id = 'a'.repeat(24);
      expect(cookieNameFor(id)).toBe(`airplex_device_${id}`);
    });
  });

  describe('computeDeviceFp', () => {
    it('returns a 32-char hex string', () => {
      const fp = computeDeviceFp('Mozilla/5.0', 'en-US');
      expect(fp).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(fp)).toBe(true);
    });

    it('is deterministic — same inputs produce same fingerprint', () => {
      const fp1 = computeDeviceFp('Mozilla/5.0 (iPhone)', 'en-US,en;q=0.9');
      const fp2 = computeDeviceFp('Mozilla/5.0 (iPhone)', 'en-US,en;q=0.9');
      expect(fp1).toBe(fp2);
    });

    it('different UA produces different fingerprint', () => {
      const fp1 = computeDeviceFp('Safari/537', 'en');
      const fp2 = computeDeviceFp('Chrome/120', 'en');
      expect(fp1).not.toBe(fp2);
    });

    it('different acceptLanguage produces different fingerprint', () => {
      const fp1 = computeDeviceFp('Mozilla/5.0', 'en-US');
      const fp2 = computeDeviceFp('Mozilla/5.0', 'fr-FR');
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('ironConfigFor', () => {
    it('returns correct cookieName', () => {
      const config = ironConfigFor('testid', 3600);
      expect(config.cookieName).toBe('airplex_device_testid');
    });

    it('caps maxAge at 30 days', () => {
      const thirtyDays = 30 * 86400;
      const config = ironConfigFor('testid', thirtyDays + 9999);
      expect(config.cookieOptions?.maxAge).toBe(thirtyDays);
    });

    it('accepts ttl below the 30-day cap', () => {
      const config = ironConfigFor('testid', 3600);
      expect(config.cookieOptions?.maxAge).toBe(3600);
    });

    it('sets secure:false in test env (NODE_ENV=test)', () => {
      // setup.ts sets NODE_ENV=test
      const config = ironConfigFor('testid', 3600);
      expect(config.cookieOptions?.secure).toBe(false);
    });

    it('sets httpOnly:true', () => {
      const config = ironConfigFor('testid', 3600);
      expect(config.cookieOptions?.httpOnly).toBe(true);
    });

    it('sets sameSite:lax', () => {
      const config = ironConfigFor('testid', 3600);
      expect(config.cookieOptions?.sameSite).toBe('lax');
    });

    it('sets path:/', () => {
      const config = ironConfigFor('testid', 3600);
      expect(config.cookieOptions?.path).toBe('/');
    });
  });
});
