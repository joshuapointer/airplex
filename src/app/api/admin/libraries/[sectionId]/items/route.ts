import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/auth/guards';
import { listItems } from '@/plex/libraries';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const { sectionId } = await params;
  const { searchParams } = req.nextUrl;
  const start = Number(searchParams.get('start') ?? '0');
  const size = Number(searchParams.get('size') ?? '50');

  return NextResponse.json(await listItems(sectionId, start, size));
}
