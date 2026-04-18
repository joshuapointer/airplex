import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { rewriteManifest, encodeSegmentBlob, decodeSegmentBlob } from '@/plex/hls-rewriter';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const LINK_ID = 'testlinkid1';
const PLEX_BASE = 'http://localhost:32400';

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

describe('hls-rewriter', () => {
  describe('master playlist rewrite', () => {
    it('rewrites all stream URIs in master playlist', () => {
      const manifest = readFixture('plex-master.m3u8');
      const { manifest: out, segments } = rewriteManifest({
        manifest,
        linkId: LINK_ID,
        plexBaseUrl: PLEX_BASE,
      });
      // 3 stream URIs in fixture
      expect(segments).toBe(3);
      expect(out).not.toContain('X-Plex-Token');
      expect(out).not.toContain('localhost:32400');
      // All rewritten URIs go through our proxy
      const lines = out.split('\n').filter((l) => !l.startsWith('#') && l.trim().length > 0);
      for (const line of lines) {
        expect(line).toMatch(/^\/api\/hls\/testlinkid1\/seg\//);
      }
    });

    it('preserves #EXTM3U and comment lines', () => {
      const manifest = readFixture('plex-master.m3u8');
      const { manifest: out } = rewriteManifest({
        manifest,
        linkId: LINK_ID,
        plexBaseUrl: PLEX_BASE,
      });
      expect(out).toContain('#EXTM3U');
      expect(out).toContain('#EXT-X-STREAM-INF:');
    });
  });

  describe('media playlist rewrite', () => {
    it('rewrites segment lines and EXT-X-MAP URI', () => {
      const manifest = readFixture('plex-media.m3u8');
      const { manifest: out, segments } = rewriteManifest({
        manifest,
        linkId: LINK_ID,
        plexBaseUrl: PLEX_BASE,
      });
      // 4 segment lines + 1 EXT-X-MAP + 1 EXT-X-KEY = 6 rewrites
      expect(segments).toBe(6);
      expect(out).not.toContain('X-Plex-Token');
    });

    it('rewrites EXT-X-KEY URI', () => {
      const manifest = readFixture('plex-media.m3u8');
      const { manifest: out } = rewriteManifest({
        manifest,
        linkId: LINK_ID,
        plexBaseUrl: PLEX_BASE,
      });
      const keyLine = out.split('\n').find((l) => l.startsWith('#EXT-X-KEY:'));
      expect(keyLine).toBeDefined();
      expect(keyLine).toContain(`URI="/api/hls/${LINK_ID}/seg/`);
      expect(keyLine).not.toContain('X-Plex-Token');
    });

    it('rewrites EXT-X-MAP URI', () => {
      const manifest = readFixture('plex-media.m3u8');
      const { manifest: out } = rewriteManifest({
        manifest,
        linkId: LINK_ID,
        plexBaseUrl: PLEX_BASE,
      });
      const mapLine = out.split('\n').find((l) => l.startsWith('#EXT-X-MAP:'));
      expect(mapLine).toBeDefined();
      expect(mapLine).toContain(`URI="/api/hls/${LINK_ID}/seg/`);
    });

    it('no X-Plex-Token anywhere in output', () => {
      const manifest = readFixture('plex-media.m3u8');
      const { manifest: out } = rewriteManifest({
        manifest,
        linkId: LINK_ID,
        plexBaseUrl: PLEX_BASE,
      });
      expect(out).not.toContain('X-Plex-Token');
    });
  });

  describe('blob round-trip', () => {
    it('encodes and decodes a path correctly', () => {
      const originalPath = '/video/:/transcode/universal/session/abc/seg0.ts';
      const blob = encodeSegmentBlob(originalPath, LINK_ID);
      const decoded = decodeSegmentBlob(blob, LINK_ID);
      expect(decoded).toBe(originalPath);
    });

    it('strips X-Plex-Token from encoded path', () => {
      const pathWithToken = '/video/:/transcode/universal/seg0.ts?X-Plex-Token=MYSECRET&foo=bar';
      const blob = encodeSegmentBlob(pathWithToken, LINK_ID);
      const decoded = decodeSegmentBlob(blob, LINK_ID);
      expect(decoded).not.toContain('X-Plex-Token');
      expect(decoded).toContain('foo=bar');
    });

    it('tamper: wrong linkId throws on decode', () => {
      const originalPath = '/video/:/transcode/universal/seg0.ts';
      const blob = encodeSegmentBlob(originalPath, LINK_ID);
      expect(() => decodeSegmentBlob(blob, 'differentid1')).toThrow();
    });

    it('tamper: corrupted blob throws on decode', () => {
      const blob = encodeSegmentBlob('/some/path', LINK_ID);
      const corrupted = blob.slice(0, -4) + 'XXXX';
      expect(() => decodeSegmentBlob(corrupted, LINK_ID)).toThrow();
    });

    it('encodes blob as base64url (no +, /, =)', () => {
      const blob = encodeSegmentBlob('/test/path', LINK_ID);
      expect(blob).not.toContain('+');
      expect(blob).not.toContain('/');
      expect(blob).not.toContain('=');
    });
  });
});
