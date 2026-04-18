import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { verifyCsrf } from '@/lib/csrf';
import { setSetting } from '@/db/queries/settings';
import { z } from 'zod';

export const runtime = 'nodejs';

const Body = z.object({
  pinId: z.number().int().positive(),
  pinCode: z.string().min(1),
});

// The PIN is now created client-side (browser → plex.tv) so plex.tv sees
// the user's real IP instead of the server's datacenter IP. This route
// just stores the pin for the callback to poll.
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

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  setSetting('plex_setup_pin_id', String(parsed.data.pinId));
  setSetting('plex_setup_pin_code', parsed.data.pinCode);

  return NextResponse.json({ ok: true });
}
