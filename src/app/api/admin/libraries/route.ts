import { NextResponse } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { listSections } from '@/plex/libraries';

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
  return NextResponse.json(await listSections());
}
