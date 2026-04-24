import { NextResponse } from 'next/server';
import { requireShareAccess } from '@/auth/guards';
import { logEvent } from '@/db/queries/events';
import { pingSession } from '@/plex/transcode';
import type { ShareRow } from '@/types/share';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLAY_LOG_THROTTLE_MS = 45_000;
const LAST_LOG_MAX_ENTRIES = 10_000;

// In-memory; single-instance assumption per README. Bounded by LRU eviction
// to prevent unbounded growth across a long-running process with many shares.
const lastLog = new Map<string, number>();

function touchLastLog(shareId: string, nowMs: number): void {
  lastLog.delete(shareId);
  lastLog.set(shareId, nowMs);
  while (lastLog.size > LAST_LOG_MAX_ENTRIES) {
    const oldest = lastLog.keys().next().value;
    if (oldest === undefined) break;
    lastLog.delete(oldest);
  }
}

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

  const nowMs = Date.now();
  if (nowMs - (lastLog.get(row.id) ?? 0) > PLAY_LOG_THROTTLE_MS) {
    logEvent({
      share_id: row.id,
      kind: 'play',
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    touchLastLog(row.id, nowMs);
  }

  await pingSession(row.id);
  return NextResponse.json({ ok: true });
}
