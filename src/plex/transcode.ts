// src/plex/transcode.ts
//
// Transcode URL builder and session lifecycle helpers.
//
// CRITICAL: the token is NEVER included in the URL. plexFetch injects it
// as an X-Plex-Token request header. See plan §F item 5.

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { plexFetch } from './client';
import type { PlexTranscodeStartParams } from '@/types/plex';

export function buildStartUrl(params: PlexTranscodeStartParams): string {
  const { ratingKey, linkId, maxVideoBitrate } = params;
  const url = new URL(`${env.PLEX_BASE_URL}/video/:/transcode/universal/start.m3u8`);
  const q = url.searchParams;
  q.set('path', `/library/metadata/${ratingKey}`);
  q.set('mediaIndex', '0');
  q.set('protocol', 'hls');
  q.set('directPlay', '1');
  q.set('directStream', '1');
  q.set('maxVideoBitrate', String(maxVideoBitrate ?? 20000));
  q.set('X-Plex-Client-Identifier', env.PLEX_CLIENT_IDENTIFIER);
  q.set('session', linkId);
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
