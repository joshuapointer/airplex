import { describe, it, expect } from 'vitest';
import { computeDeviceFp } from '@/lib/device-lock';

describe('device-lock', () => {
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

    it('keyed with DEVICE_LOCK_SECRET — empty input still produces 32 hex chars', () => {
      const fp = computeDeviceFp('', '');
      expect(fp).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(fp)).toBe(true);
    });
  });
});
