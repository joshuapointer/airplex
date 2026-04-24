// src/app/api/share/[token]/manifest/route.ts
//
// Dynamic PWA Web App Manifest for a recipient share. Each share produces
// its own manifest so "Add to Home Screen" installs an app whose name and
// icon reflect the title that was shared.
//
// - Gate: share-token signature + token_hash lookup + active status.
//   Mirrors `/api/share/[token]/poster/route.ts`. No cookie, no claim.
// - Icons: one entry pointing to the existing poster proxy. iOS and Android
//   both accept a single `sizes: "any"` entry; the browser scales.
// - Rate-limit: per-token token bucket (30/min).

import { NextResponse } from 'next/server';

import { computeShareStatus, getShareByTokenHash } from '@/db/queries/shares';
import { rateLimit } from '@/lib/ratelimit';
import { buildShareDescription } from '@/lib/share-metadata';
import { hashShareToken, verifyShareTokenSignature } from '@/lib/share-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MANIFEST_CAPACITY = 30;
const MANIFEST_REFILL_PER_SEC = 30 / 60;

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

function buildShortName(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;

  if (!verifyShareTokenSignature(token)) {
    return notFound();
  }

  if (!rateLimit(`manifest:${token}`, MANIFEST_CAPACITY, MANIFEST_REFILL_PER_SEC)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const row = getShareByTokenHash(hashShareToken(token));
  if (!row) {
    return notFound();
  }

  const status = computeShareStatus(row);
  if (!status.active) {
    return notFound();
  }

  const manifest = {
    name: row.title,
    short_name: buildShortName(row.title),
    description: buildShareDescription(row),
    start_url: `/s/${token}`,
    scope: `/s/${token}`,
    display: 'standalone',
    orientation: 'any',
    theme_color: '#000000',
    background_color: '#000000',
    icons: row.poster_path
      ? [
          {
            src: `/api/share/${token}/poster`,
            sizes: 'any',
            type: 'image/jpeg',
            purpose: 'any',
          },
        ]
      : [],
  };

  return NextResponse.json(manifest, {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'private, max-age=300',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
