import http from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * Tiny in-process Plex stub (spec §12.2 step 1).
 *
 * Starts an HTTP server on a random free port and answers:
 *   - `GET /video/:/transcode/universal/start.m3u8` → a fixed HLS media
 *     playlist (one segment, points to /seg/0.ts on the same server).
 *   - Any other path → 200 + a tiny binary body.
 *
 * Intended usage:
 *
 *   const plex = await startPlexStub();
 *   // point PLEX_BASE_URL at plex.url for an in-process test
 *   // run assertions...
 *   await plex.stop();
 *
 * NOTE: the current integration spec (`share-device-lock.spec.ts`) exercises
 * only `/s/[token]`, which does not call Plex. This stub exists so follow-up
 * specs that cover the HLS proxy can reuse it without touching the config.
 */

const MEDIA_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXTINF:5.000,',
  '/seg/0.ts',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

export interface PlexStubHandle {
  url: string;
  stop(): Promise<void>;
}

export async function startPlexStub(): Promise<PlexStubHandle> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub.local');

    if (url.pathname === '/video/:/transcode/universal/start.m3u8') {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
      });
      res.end(MEDIA_PLAYLIST);
      return;
    }

    // Fallback: tiny binary body. Content-Type mirrors a real TS segment so
    // downstream proxy logic that inspects headers stays happy.
    const body = Buffer.from([0x47, 0x40, 0x00, 0x10]); // MPEG-TS sync byte run
    res.writeHead(200, {
      'Content-Type': 'video/mp2t',
      'Content-Length': String(body.length),
    });
    res.end(body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
