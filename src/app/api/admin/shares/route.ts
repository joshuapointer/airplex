import { NextResponse, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { verifyCsrf } from '@/lib/csrf';
import { env } from '@/lib/env';
import { extractClientIp } from '@/lib/ip';
import { createShareToken } from '@/lib/share-token';
import { insertShare, listShares } from '@/db/queries/shares';
import { logEvent } from '@/db/queries/events';
import { getMetadata } from '@/plex/metadata';
import { logger } from '@/lib/logger';
import type { ShareRow } from '@/types/share';

const createBody = z.object({
  ratingKey: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  mediaType: z.enum(['movie', 'episode', 'show']),
  recipient_label: z.string().min(1).max(120),
  recipient_note: z.string().max(2000).optional(),
  sender_label: z.string().max(60).optional(),
  // null = never expires; a number = TTL in hours
  ttl_hours: z
    .union([z.literal(null), z.coerce.number().int().min(1).max(env.SHARE_MAX_TTL_HOURS)])
    .optional(),
  max_plays: z.union([z.literal(null), z.coerce.number().int().positive()]).optional(),
});

const listQuery = z.object({
  status: z.enum(['active', 'expired', 'revoked']).optional(),
});

function stripTokenHash(row: ShareRow): Omit<ShareRow, 'token_hash'> {
  // Destructure to drop token_hash; never leak hash to clients.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token_hash, ...rest } = row;
  return rest;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let session;
  try {
    session = await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  if (!verifyCsrf(session, req.headers.get('x-airplex-csrf'))) {
    return NextResponse.json({ error: 'csrf' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = createBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const now = Math.floor(Date.now() / 1000);
  // Explicit null = never expires. Missing field falls back to default TTL.
  const ttlHours = body.ttl_hours === null ? null : (body.ttl_hours ?? env.SHARE_DEFAULT_TTL_HOURS);
  const expiresAt = ttlHours === null ? null : now + ttlHours * 3600;
  const id = nanoid(12);
  const { token, tokenHash } = createShareToken();

  // Snapshot poster path from Plex at create time so the recipient sees
  // artwork even if Plex is unreachable later. Non-fatal on failure — the
  // recipient screen gracefully degrades to the text-only layout.
  let posterPath: string | null = null;
  try {
    const meta = await getMetadata(body.ratingKey);
    posterPath = meta.thumb ?? null;
  } catch (err) {
    logger.warn(
      { err, ratingKey: body.ratingKey },
      'failed to snapshot poster_path at share create — continuing',
    );
  }

  const senderLabelTrimmed = body.sender_label?.trim();
  const senderLabel = senderLabelTrimmed ? senderLabelTrimmed : null;

  const row: ShareRow = {
    id,
    token_hash: tokenHash,
    plex_rating_key: body.ratingKey,
    title: body.title,
    plex_media_type: body.mediaType,
    recipient_label: body.recipient_label,
    recipient_note: body.recipient_note ?? null,
    sender_label: senderLabel,
    poster_path: posterPath,
    created_at: now,
    expires_at: expiresAt,
    max_plays: body.max_plays ?? null,
    play_count: 0,
    device_fingerprint_hash: null,
    device_locked_at: null,
    revoked_at: null,
    created_by_sub: session.sub,
  };

  insertShare(row);
  logEvent({
    share_id: id,
    kind: 'created',
    ip: extractClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json(
    {
      id,
      token,
      shareUrl: `${env.APP_URL}/s/${token}`,
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const statusParam = req.nextUrl.searchParams.get('status') ?? undefined;
  const parsed = listQuery.safeParse({ status: statusParam });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const rows = listShares({ status: parsed.data.status });
  return NextResponse.json(rows.map(stripTokenHash));
}
