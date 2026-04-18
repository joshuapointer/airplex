import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { verifyCsrf } from '@/lib/csrf';
import { env } from '@/lib/env';
import { buildAuthUrl, createPin } from '@/plex/account';
import { setSetting } from '@/db/queries/settings';

export const runtime = 'nodejs';

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

  const pin = await createPin(env.PLEX_CLIENT_IDENTIFIER);
  setSetting('plex_setup_pin_id', String(pin.id));
  setSetting('plex_setup_pin_code', pin.code);

  const forwardUrl = `${env.APP_URL}/api/setup/plex/callback`;
  const authUrl = buildAuthUrl(pin.code, env.PLEX_CLIENT_IDENTIFIER, forwardUrl);

  return NextResponse.json({ authUrl });
}
