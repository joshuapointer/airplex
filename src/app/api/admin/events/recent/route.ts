import { NextResponse } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { rateLimit } from '@/lib/ratelimit';
import { listRecentEventsWithShare } from '@/db/queries/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  let session;
  try {
    session = await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  if (!rateLimit(`events-tail:${session.sub}`, 60, 1)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const events = listRecentEventsWithShare(5);
  return NextResponse.json(
    { events, serverTs: Math.floor(Date.now() / 1000) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
