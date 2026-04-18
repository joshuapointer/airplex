import { NextResponse } from 'next/server';
import { requireShareAccess } from '@/auth/guards';
import { pingSession } from '@/plex/transcode';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ link_id: string }> },
): Promise<NextResponse> {
  const { link_id: linkId } = await context.params;

  const guarded: ShareRow | unknown = await requireShareAccess(request, linkId).catch(
    (r: unknown) => r,
  );
  if (guarded instanceof NextResponse) return guarded;
  if (!guarded || typeof guarded !== 'object' || !('id' in guarded)) {
    throw guarded;
  }
  const row = guarded as ShareRow;

  await pingSession(row.id);
  return NextResponse.json({ ok: true });
}
