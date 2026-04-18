import { NextResponse } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { env } from '@/lib/env';
import { listResources } from '@/plex/account';
import { getPlexToken } from '@/plex/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const token = getPlexToken();
  if (!token) {
    return NextResponse.json({ error: 'plex_not_configured' }, { status: 503 });
  }

  const resources = await listResources(token, env.PLEX_CLIENT_IDENTIFIER);
  return NextResponse.json({
    servers: resources.map((r) => ({
      name: r.name,
      owned: r.owned,
      connections: r.connections,
    })),
  });
}
