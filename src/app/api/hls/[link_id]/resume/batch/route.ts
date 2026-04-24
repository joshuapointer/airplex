// src/app/api/hls/[link_id]/resume/batch/route.ts
//
// Batch resume endpoint. Returns every saved resume position for a share
// in one round trip so the side-panel queue / episode picker don't issue
// one `GET /resume?ratingKey=X` per episode (O(n) requests).

import { NextResponse } from 'next/server';

import { requireShareAccess } from '@/auth/guards';
import { listResumePositions } from '@/db/queries/resume';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface BatchResumeEntry {
  positionMs: number;
  durationMs: number | null;
  updatedAt: number;
}

export interface BatchResumeResponse {
  positions: Record<string, BatchResumeEntry>;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ link_id: string }> },
): Promise<NextResponse> {
  const { link_id: linkId } = await context.params;

  const guarded: ShareRow | unknown = await requireShareAccess(request, linkId).catch(
    (r: unknown) => r,
  );
  if (guarded instanceof NextResponse) return guarded;
  if (!guarded || typeof guarded !== 'object' || !('id' in guarded)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const row = guarded as ShareRow;

  const rows = listResumePositions(row.id);
  const positions: Record<string, BatchResumeEntry> = {};
  for (const r of rows) {
    positions[r.rating_key] = {
      positionMs: r.position_ms,
      durationMs: r.duration_ms,
      updatedAt: r.updated_at,
    };
  }

  const body: BatchResumeResponse = { positions };
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=5' },
  });
}
