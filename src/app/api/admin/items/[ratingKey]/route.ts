import { NextResponse } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { getMetadata } from '@/plex/metadata';

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
  return NextResponse.json(await getMetadata(ratingKey));
}
