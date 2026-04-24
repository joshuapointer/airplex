import { describe, it, expect, beforeEach } from 'vitest';

import { __resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { __resetStmtsForTests, insertShare } from '@/db/queries/shares';
import { buildShareMetadata, FALLBACK_SHARE_METADATA } from '@/lib/share-metadata';
import { createShareToken } from '@/lib/share-token';

import { makeFakeShareRow } from './_helpers';

beforeEach(() => {
  __resetStmtsForTests();
  __resetDbForTests();
  runMigrations();
});

describe('buildShareMetadata', () => {
  it('returns fallback metadata for invalid token', () => {
    const md = buildShareMetadata('nodothere');
    expect(md).toEqual(FALLBACK_SHARE_METADATA);
  });

  it('returns fallback metadata when share row missing', () => {
    const { token } = createShareToken();
    const md = buildShareMetadata(token);
    expect(md).toEqual(FALLBACK_SHARE_METADATA);
  });

  it('returns fallback metadata when share is revoked', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'revoked1',
        token_hash: tokenHash,
        revoked_at: Math.floor(Date.now() / 1000),
      }),
    );
    const md = buildShareMetadata(token);
    expect(md).toEqual(FALLBACK_SHARE_METADATA);
  });

  it('returns fallback metadata when share is expired', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'expired1',
        token_hash: tokenHash,
        expires_at: Math.floor(Date.now() / 1000) - 3600,
      }),
    );
    const md = buildShareMetadata(token);
    expect(md).toEqual(FALLBACK_SHARE_METADATA);
  });

  it('returns rich metadata for an active share with poster', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'active1',
        token_hash: tokenHash,
        title: 'Blade Runner 2049',
        plex_media_type: 'movie',
        recipient_label: 'Alice',
        sender_label: 'Bob',
        poster_path: '/library/metadata/99/thumb/1',
      }),
    );

    const md = buildShareMetadata(token);

    expect(md.title).toBe('Blade Runner 2049');
    expect(md.robots).toBe('noindex,nofollow');
    expect(md.referrer).toBe('no-referrer');
    expect(md.manifest).toBe(`http://localhost:3000/api/share/${token}/manifest`);

    // OpenGraph — cast to Record to read fields Next's narrow types don't expose directly
    const og = md.openGraph as Record<string, unknown> | undefined;
    expect(og?.title).toBe('Blade Runner 2049');
    expect(og?.url).toBe(`http://localhost:3000/s/${token}`);
    expect(og?.siteName).toBe('airplex');
    expect(og?.type).toBe('video.movie');
    const ogImages = og?.images as Array<{ url: string }> | undefined;
    expect(ogImages?.[0]?.url).toBe(`http://localhost:3000/api/share/${token}/poster`);

    // Twitter
    const tw = md.twitter as Record<string, unknown> | undefined;
    expect(tw?.card).toBe('summary_large_image');
    const twImages = tw?.images as string[] | undefined;
    expect(twImages?.[0]).toBe(`http://localhost:3000/api/share/${token}/poster`);

    // Apple web app — title reflects shared title (used by iOS home-screen).
    const appleWebApp = md.appleWebApp as { capable?: boolean; title?: string } | undefined;
    expect(appleWebApp?.capable).toBe(true);
    expect(appleWebApp?.title).toBe('Blade Runner 2049');
  });

  it('uses video.tv_show type for shows/episodes', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'show1',
        token_hash: tokenHash,
        plex_media_type: 'show',
      }),
    );
    const md = buildShareMetadata(token);
    const og = md.openGraph as Record<string, unknown> | undefined;
    expect(og?.type).toBe('video.tv_show');
  });

  it('description prefers recipient_note when present', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'note1',
        token_hash: tokenHash,
        recipient_note: 'Watch this tonight!',
        sender_label: 'Bob',
        recipient_label: 'Alice',
      }),
    );
    const md = buildShareMetadata(token);
    expect(md.description).toBe('Watch this tonight!');
  });

  it('description falls back to sender/recipient line when no note', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'nonote1',
        token_hash: tokenHash,
        recipient_note: null,
        sender_label: 'Bob',
        recipient_label: 'Alice',
      }),
    );
    const md = buildShareMetadata(token);
    expect(md.description).toBe('From Bob for Alice');
  });

  it('omits og:image when share has no poster_path', () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'noposter1',
        token_hash: tokenHash,
        poster_path: null,
      }),
    );
    const md = buildShareMetadata(token);
    expect(md.openGraph?.images).toBeUndefined();
    expect(md.twitter?.images).toBeUndefined();
  });
});
