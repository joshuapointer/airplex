// src/lib/share-metadata.ts
//
// Pure helpers + Metadata builder for the recipient share page. Extracted
// out of page.tsx so the builder is unit-testable without pulling in React
// client components (ShareWatcher → hls.js → browser-only).
//
// Runs on every share page render (including link-preview crawler requests).
// MUST stay side-effect-free: no DB writes, no cookie mutations — crawlers
// hit this before the real recipient and any write here would lock the
// share to the crawler's fingerprint.

import type { Metadata } from 'next';

import { computeShareStatus, getShareByTokenHash } from '@/db/queries/shares';
import { env } from '@/lib/env';
import { hashShareToken, verifyShareTokenSignature } from '@/lib/share-token';
import type { ShareRow } from '@/types/share';

export const FALLBACK_SHARE_METADATA: Metadata = {
  title: 'airplex',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

export function buildShareDescription(row: ShareRow): string {
  if (row.recipient_note && row.recipient_note.trim().length > 0) {
    return row.recipient_note.trim();
  }
  const from = row.sender_label ? `From ${row.sender_label} ` : '';
  return `${from}for ${row.recipient_label}`.trim();
}

export function buildShareMetadata(token: string): Metadata {
  if (!verifyShareTokenSignature(token)) {
    return FALLBACK_SHARE_METADATA;
  }

  const row = getShareByTokenHash(hashShareToken(token));
  if (!row) {
    return FALLBACK_SHARE_METADATA;
  }

  const status = computeShareStatus(row);
  if (!status.active) {
    return FALLBACK_SHARE_METADATA;
  }

  const description = buildShareDescription(row);
  const shareUrl = `${env.APP_URL}/s/${token}`;
  const posterUrl = `${env.APP_URL}/api/share/${token}/poster`;
  const manifestUrl = `${env.APP_URL}/api/share/${token}/manifest`;
  const ogType = row.plex_media_type === 'movie' ? 'video.movie' : 'video.tv_show';

  return {
    title: row.title,
    description,
    referrer: 'no-referrer',
    robots: 'noindex,nofollow',
    manifest: manifestUrl,
    openGraph: {
      title: row.title,
      description,
      url: shareUrl,
      siteName: 'airplex',
      type: ogType,
      images: row.poster_path
        ? [{ url: posterUrl, width: 600, height: 900, alt: row.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: row.title,
      description,
      images: row.poster_path ? [posterUrl] : undefined,
    },
    appleWebApp: {
      capable: true,
      title: row.title,
      statusBarStyle: 'black-translucent',
    },
    other: {
      'apple-mobile-web-app-title': row.title,
      'application-name': row.title,
    },
  };
}
