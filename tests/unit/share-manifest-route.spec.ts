import { describe, it, expect, beforeEach } from 'vitest';

import { GET } from '@/app/api/share/[token]/manifest/route';
import { __resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { __resetStmtsForTests, insertShare } from '@/db/queries/shares';
import { _resetRateLimitForTests } from '@/lib/ratelimit';
import { createShareToken } from '@/lib/share-token';

import { makeFakeShareRow } from './_helpers';

function makeReq(): Request {
  return new Request('http://localhost/api/share/x/manifest');
}

async function callRoute(token: string): Promise<Response> {
  return GET(makeReq(), { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  __resetStmtsForTests();
  __resetDbForTests();
  runMigrations();
  _resetRateLimitForTests();
});

describe('share manifest route', () => {
  it('returns 404 for invalid token signature', async () => {
    const res = await callRoute('nodothere');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('returns 404 when share row missing', async () => {
    const { token } = createShareToken();
    const res = await callRoute(token);
    expect(res.status).toBe(404);
  });

  it('returns 404 for expired share', async () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'expired1',
        token_hash: tokenHash,
        expires_at: Math.floor(Date.now() / 1000) - 60,
      }),
    );
    const res = await callRoute(token);
    expect(res.status).toBe(404);
  });

  it('returns 404 for revoked share', async () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'revoked1',
        token_hash: tokenHash,
        revoked_at: Math.floor(Date.now() / 1000),
      }),
    );
    const res = await callRoute(token);
    expect(res.status).toBe(404);
  });

  it('returns a valid PWA manifest for an active share', async () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'active1',
        token_hash: tokenHash,
        title: 'Blade Runner 2049',
        recipient_label: 'Alice',
        sender_label: 'Bob',
        poster_path: '/library/metadata/99/thumb/1',
      }),
    );

    const res = await callRoute(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/manifest+json');

    const body = (await res.json()) as {
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    expect(body.name).toBe('Blade Runner 2049');
    expect(body.short_name).toBe('Blade Runne…');
    expect(body.description).toBe('From Bob for Alice');
    expect(body.start_url).toBe(`/s/${token}`);
    expect(body.scope).toBe(`/s/${token}`);
    expect(body.display).toBe('standalone');
    expect(body.theme_color).toBe('#000000');
    expect(body.icons).toHaveLength(1);
    expect(body.icons[0]?.src).toBe(`/api/share/${token}/poster`);
    expect(body.icons[0]?.sizes).toBe('any');
  });

  it('returns manifest with empty icons when no poster', async () => {
    const { token, tokenHash } = createShareToken();
    insertShare(
      makeFakeShareRow({
        id: 'noposter1',
        token_hash: tokenHash,
        poster_path: null,
      }),
    );
    const res = await callRoute(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { icons: unknown[] };
    expect(body.icons).toEqual([]);
  });

  it('rate-limits after 30 requests per minute per token', async () => {
    const { token, tokenHash } = createShareToken();
    insertShare(makeFakeShareRow({ id: 'rl1', token_hash: tokenHash }));

    for (let i = 0; i < 30; i++) {
      const ok = await callRoute(token);
      expect(ok.status).toBe(200);
    }
    const limited = await callRoute(token);
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: string };
    expect(body.error).toBe('rate_limited');
  });
});
