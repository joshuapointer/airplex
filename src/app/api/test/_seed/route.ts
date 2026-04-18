// test-only: disabled unless NODE_ENV=test
//
// Integration-only helper (plan §C-Group-E-E2). Gates on `NODE_ENV === 'test'`
// so this route returns 404 in development and production builds. It exists
// so Playwright specs can seed a share row directly into the DB without
// going through the admin OIDC flow.
//
// POST body: { ratingKey?, title?, recipient_label? }
// Response:  { id, token, shareUrl }

import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

import { runMigrations } from '@/db/migrate';
import { insertShare } from '@/db/queries/shares';
import { env } from '@/lib/env';
import { createShareToken } from '@/lib/share-token';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';

function disabledResponse(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (env.NODE_ENV !== 'test') {
    return disabledResponse();
  }

  // Ensure schema exists — when the webServer boots against a fresh temp DB
  // path, migrations have not run yet.
  runMigrations();

  let body: { ratingKey?: string; title?: string; recipient_label?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const ratingKey = body.ratingKey ?? '12345';
  const title = body.title ?? 'Integration Test Movie';
  const recipientLabel = body.recipient_label ?? 'playwright';

  const id = nanoid(12);
  const { token, tokenHash } = createShareToken();
  const now = Math.floor(Date.now() / 1000);

  const row: ShareRow = {
    id,
    token_hash: tokenHash,
    plex_rating_key: ratingKey,
    title,
    plex_media_type: 'movie',
    recipient_label: recipientLabel,
    recipient_note: null,
    created_at: now,
    expires_at: now + 3600, // 1 hour
    max_plays: null,
    play_count: 0,
    device_fingerprint_hash: null,
    device_locked_at: null,
    revoked_at: null,
    created_by_sub: 'test-seed',
  };

  insertShare(row);

  return NextResponse.json({
    id,
    token,
    shareUrl: `${env.APP_URL}/s/${token}`,
  });
}

export function GET(): NextResponse {
  return disabledResponse();
}
