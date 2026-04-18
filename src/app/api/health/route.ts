import { NextResponse } from 'next/server';
import { PACKAGE_VERSION } from '@/lib/env';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    version: PACKAGE_VERSION,
    ts: Date.now(),
  });
}
