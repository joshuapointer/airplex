import { NextResponse } from 'next/server';
import { PACKAGE_VERSION } from '@/lib/env';
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
    version: PACKAGE_VERSION,
    ts: Date.now(),
  });
}
