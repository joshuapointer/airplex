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
  if (!/^\d+$/.test(sectionId)) {
    return NextResponse.json({ error: 'invalid_section_id' }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;

  const rawStart = Number(searchParams.get('start') ?? '0');
  if (!Number.isInteger(rawStart) || rawStart < 0 || rawStart > 10000) {
    return NextResponse.json({ error: 'invalid_start' }, { status: 400 });
  }
  const start = rawStart;

  const rawSize = Number(searchParams.get('size') ?? '50');
  if (!Number.isInteger(rawSize) || rawSize < 1 || rawSize > 200) {
    return NextResponse.json({ error: 'invalid_size' }, { status: 400 });
  }
  const size = rawSize;

  return NextResponse.json(await listItems(sectionId, start, size));
}
