// src/plex/transcode.ts
//
// Transcode URL builder and session lifecycle helpers.
//
// CRITICAL: the token is NEVER included in the URL. plexFetch injects it
// as an X-Plex-Token request header. See plan §F item 5.

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { plexFetch, PlexError } from './client';
import { getPlexBaseUrl } from './config';
import type { PlexTranscodeStartParams } from '@/types/plex';

export function buildStartUrl(params: PlexTranscodeStartParams): string {
  const { ratingKey, linkId, maxVideoBitrate } = params;
  const base = getPlexBaseUrl();
  if (!base) {
    throw new PlexError(
      503,
      '/video/:/transcode/universal/start.m3u8',
      'Plex not configured — complete setup at /setup/plex',
    );
  }
  const url = new URL(`${base}/video/:/transcode/universal/start.m3u8`);
  const q = url.searchParams;
  q.set('path', `/library/metadata/${ratingKey}`);
  q.set('mediaIndex', '0');
  q.set('partIndex', '0');
  q.set('protocol', 'hls');
  q.set('directPlay', '0');
  q.set('directStream', '1');
  q.set('fastSeek', '1');
  q.set('hasMDE', '1');
  q.set('copyts', '1');
  q.set('offset', '0');
  q.set('audioBoost', '100');
  q.set('location', 'lan');
  q.set('maxVideoBitrate', String(maxVideoBitrate ?? 20000));
  q.set('session', linkId);
  // Plex rejects transcode requests without the full X-Plex device set —
  // returns a bare 400 Bad Request. Client-Identifier alone isn't enough.
  q.set('X-Plex-Product', 'airplex');
  q.set('X-Plex-Version', '1.0');
  q.set('X-Plex-Platform', 'Web');
  q.set('X-Plex-Platform-Version', '1.0');
  q.set('X-Plex-Device', 'airplex');
  q.set('X-Plex-Device-Name', 'airplex');
  q.set('X-Plex-Client-Identifier', env.PLEX_CLIENT_IDENTIFIER);
  return url.toString();
}

export async function pingSession(linkId: string): Promise<void> {
  try {
    await plexFetch({
      path: '/video/:/transcode/universal/ping',
      query: { session: linkId },
      method: 'POST',
    });
  } catch (err) {
    logger.warn({ err, linkId }, 'plex ping failed (non-fatal)');
  }
}

export async function stopSession(linkId: string): Promise<void> {
  try {
    await plexFetch({
      path: '/video/:/transcode/universal/stop',
      query: { session: linkId },
      method: 'POST',
    });
  } catch (err) {
    logger.warn({ err, linkId }, 'plex stop failed (non-fatal)');
  }
}
