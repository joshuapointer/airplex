import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireShareAccess } from '@/auth/guards';
import { getResumePosition, saveResumePosition } from '@/db/queries/resume';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ratingKeyRe = /^\d+$/;
const MAX_POSITION_MS = 48 * 3600 * 1000; // sane upper bound: 48 hours

async function guard(req: Request, linkId: string): Promise<ShareRow | NextResponse> {
  const guarded: ShareRow | unknown = await requireShareAccess(req, linkId).catch(
    (r: unknown) => r,
  );
  if (guarded instanceof NextResponse) return guarded;
  if (!guarded || typeof guarded !== 'object' || !('id' in guarded)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return guarded as ShareRow;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ link_id: string }> },
): Promise<NextResponse> {
  const { link_id: linkId } = await context.params;
  const row = await guard(request, linkId);
  if (row instanceof NextResponse) return row;

  const url = new URL(request.url);
  const ratingKey = url.searchParams.get('ratingKey') ?? row.plex_rating_key;
  if (!ratingKeyRe.test(ratingKey)) {
    return NextResponse.json({ error: 'invalid_rating_key' }, { status: 400 });
  }

  const saved = getResumePosition(row.id, ratingKey);
  if (!saved) {
    return NextResponse.json({ ratingKey, positionMs: 0, durationMs: null });
  }
  return NextResponse.json({
    ratingKey: saved.rating_key,
    positionMs: saved.position_ms,
    durationMs: saved.duration_ms,
    updatedAt: saved.updated_at,
  });
}

const postBody = z.object({
  ratingKey: z.string().regex(ratingKeyRe, 'ratingKey must be numeric'),
  positionMs: z.coerce.number().int().min(0).max(MAX_POSITION_MS),
  durationMs: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ link_id: string }> },
): Promise<NextResponse> {
  const { link_id: linkId } = await context.params;
  const row = await guard(request, linkId);
  if (row instanceof NextResponse) return row;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = postBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  saveResumePosition(
    row.id,
    parsed.data.ratingKey,
    parsed.data.positionMs,
    parsed.data.durationMs ?? null,
  );
  return NextResponse.json({ ok: true });
}
