import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { plexFetch } from '@/plex/client';
import { buildStartUrl } from '@/plex/transcode';

describe('plex-client', () => {
  describe('plexFetch header injection', () => {
    let capturedRequest: Request | null = null;

    beforeEach(() => {
      capturedRequest = null;
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        capturedRequest = new Request(input as RequestInfo);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('injects X-Plex-Token header', async () => {
      // We need to capture headers from the actual call
      let capturedHeaders: Headers | null = null;
      global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      await plexFetch({ path: '/library/sections' });

      expect(capturedHeaders).not.toBeNull();
      expect(capturedHeaders!.get('X-Plex-Token')).toBe('test-token');
    });

    it('injects X-Plex-Client-Identifier header', async () => {
      let capturedHeaders: Headers | null = null;
      global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      await plexFetch({ path: '/library/sections' });

      expect(capturedHeaders!.get('X-Plex-Client-Identifier')).toBe('airplex-test');
    });

    it('injects Accept: application/json by default', async () => {
      let capturedHeaders: Headers | null = null;
      global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      await plexFetch({ path: '/library/sections' });

      expect(capturedHeaders!.get('Accept')).toBe('application/json');
    });

    it('uses correct base URL when building fetch URL', async () => {
      let capturedUrl: string | null = null;
      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = url.toString();
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      await plexFetch({ path: '/library/sections' });

      expect(capturedUrl).toContain('http://localhost:32400');
      expect(capturedUrl).toContain('/library/sections');
    });

    it('does NOT include X-Plex-Token in the URL', async () => {
      let capturedUrl: string | null = null;
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        capturedUrl = url.toString();
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      await plexFetch({ path: '/library/sections' });

      expect(capturedUrl).not.toContain('X-Plex-Token');
    });

    it('throws PlexError on non-ok response', async () => {
      global.fetch = vi.fn(
        async () => new Response('Not Found', { status: 404 }),
      ) as unknown as typeof fetch;

      await expect(plexFetch({ path: '/missing' })).rejects.toThrow();
    });
  });

  describe('buildStartUrl', () => {
    it('contains /video/:/transcode/universal/start.m3u8 path', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      expect(url).toContain('/video/:/transcode/universal/start.m3u8');
    });

    it('has path=/library/metadata/<ratingKey>', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('path')).toBe('/library/metadata/42');
    });

    it('has mediaIndex=0', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('mediaIndex')).toBe('0');
    });

    it('has protocol=hls', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('protocol')).toBe('hls');
    });

    it('has session=<linkId>', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('session')).toBe('testlink123');
    });

    it('does NOT include X-Plex-Token in the URL', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      expect(url).not.toContain('X-Plex-Token');
    });

    it('includes X-Plex-Client-Identifier in query', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('X-Plex-Client-Identifier')).toBe('airplex-test');
    });

    it('defaults maxVideoBitrate to 20000', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123' });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('maxVideoBitrate')).toBe('20000');
    });

    it('uses custom maxVideoBitrate if provided', () => {
      const url = buildStartUrl({ ratingKey: '42', linkId: 'testlink123', maxVideoBitrate: 5000 });
      const parsed = new URL(url);
      expect(parsed.searchParams.get('maxVideoBitrate')).toBe('5000');
    });
  });
});
