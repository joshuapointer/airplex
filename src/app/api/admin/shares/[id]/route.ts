import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { verifyCsrf } from '@/lib/csrf';
import { env } from '@/lib/env';
import {
  getShareById,
  revokeShare,
  resetDevice,
  extendShare,
  computeShareStatus,
} from '@/db/queries/shares';
import { logEvent } from '@/db/queries/events';
import type { ShareRow } from '@/types/share';

/**
 * IP extraction parity with C1/middleware: only honor `x-forwarded-for`
 * when `env.TRUST_PROXY` is set; otherwise fall back to `'unknown'`.
 */
function extractClientIp(req: NextRequest): string {
  if (env.TRUST_PROXY) {
    const xff = req.headers.get('x-forwarded-for');
    const first = xff?.split(',')[0]?.trim();
    if (first && first.length > 0) return first;
  }
  return 'unknown';
}

function stripTokenHash(row: ShareRow): Omit<ShareRow, 'token_hash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token_hash, ...rest } = row;
  return rest;
}

const patchBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revoke') }),
  z.object({ action: z.literal('reset_device') }),
  z.object({
    action: z.literal('extend'),
    // null = clear the expiry (never expires). A number extends by that many hours.
    ttl_hours: z.union([
      z.literal(null),
      z.coerce.number().int().min(1).max(env.SHARE_MAX_TTL_HOURS),
    ]),
  }),
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
  void req;

  const { id } = await params;
  const row = getShareById(id);
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const status = computeShareStatus(row);

  // TODO(v1.1): fetch events via a new query. B1 does not export a
  // list-events-by-share query, and adding a raw prepared statement here
  // would violate plan §F (no DB access outside `src/db/queries/*`).
  const events: never[] = [];

  return NextResponse.json({
    share: stripTokenHash(row),
    status,
    events,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id } = await params;
  const row = getShareById(id);
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = patchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const ip = extractClientIp(req);
  const userAgent = req.headers.get('user-agent');

  if (body.action === 'revoke') {
    revokeShare(id);
    logEvent({ share_id: id, kind: 'revoked', ip, userAgent });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reset_device') {
    resetDevice(id);
    logEvent({ share_id: id, kind: 'reset', ip, userAgent });
    return NextResponse.json({ ok: true });
  }

  // extend
  // DEVIATION (see route report): `ShareEventKind` has no `'extended'`
  // variant. Per task instructions, reuse `'reset'` with a detail payload
  // rather than modifying B1's type. Flagged as an open question.
  const now = Math.floor(Date.now() / 1000);
  const newExpiresAt = body.ttl_hours === null ? null : now + body.ttl_hours * 3600;
  extendShare(id, newExpiresAt);
  logEvent({
    share_id: id,
    kind: 'reset',
    ip,
    userAgent,
    detail: { action: 'extended', ttl_hours: body.ttl_hours, new_expires_at: newExpiresAt },
  });
  return NextResponse.json({ ok: true, expires_at: newExpiresAt });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  void params;
  // TODO(v1.1): implement hard-delete once B1 exports a `deleteShare`
  // query. Adding raw DB access here would violate plan §F ("no DB
  // access outside src/db/queries/*"). Returning 501 for now.
  return NextResponse.json(
    { error: 'not_implemented', detail: 'DELETE deferred to v1.1' },
    { status: 501 },
  );
}
