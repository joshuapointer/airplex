import { NextResponse } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { getChildren } from '@/plex/metadata';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ratingKey: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
  const { ratingKey } = await params;
  if (!/^\d+$/.test(ratingKey)) {
    return NextResponse.json({ error: 'invalid_rating_key' }, { status: 400 });
  }
  return NextResponse.json(await getChildren(ratingKey));
}
