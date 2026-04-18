import { NextResponse } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { env } from '@/lib/env';
import { checkPin } from '@/plex/account';
import { deleteSetting, getSetting, setSetting } from '@/db/queries/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_ATTEMPTS = 10;
const POLL_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redirect(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env.APP_URL));
}

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin('/setup/plex');
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const pinIdStr = getSetting('plex_setup_pin_id');
  const pinCode = getSetting('plex_setup_pin_code');
  if (!pinIdStr || !pinCode) {
    return redirect('/setup/plex?error=no_pin');
  }

  const pinId = Number(pinIdStr);
  if (!Number.isFinite(pinId)) {
    return redirect('/setup/plex?error=no_pin');
  }

  let authToken: string | null = null;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    try {
      authToken = await checkPin(pinId, pinCode, env.PLEX_CLIENT_IDENTIFIER);
    } catch {
      // Swallow transient errors; we'll retry up to POLL_ATTEMPTS.
      authToken = null;
    }
    if (authToken) break;
    if (attempt < POLL_ATTEMPTS - 1) await delay(POLL_DELAY_MS);
  }

  if (!authToken) {
    return redirect('/setup/plex?error=auth_timeout');
  }

  setSetting('plex_token', authToken);
  deleteSetting('plex_setup_pin_id');
  deleteSetting('plex_setup_pin_code');

  return redirect('/setup/plex/servers');
}
