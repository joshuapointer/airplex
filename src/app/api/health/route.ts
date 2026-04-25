import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    return NextResponse.json(
      { status: 'degraded', error: 'db_unavailable' },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: 'ok',
    ts: Date.now(),
  });
}
