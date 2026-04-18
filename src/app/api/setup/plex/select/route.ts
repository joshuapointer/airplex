import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/auth/guards';
import { verifyCsrf } from '@/lib/csrf';
import { setSetting } from '@/db/queries/settings';

export const runtime = 'nodejs';

const selectBody = z.object({
  serverUrl: z
    .string()
    .url('serverUrl must be a valid URL')
    .transform((v) => v.replace(/\/$/, '')),
  serverName: z.string().min(1).max(200),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = selectBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  setSetting('plex_server_url', parsed.data.serverUrl);
  setSetting('plex_server_name', parsed.data.serverName);

  return NextResponse.json({ ok: true });
}
