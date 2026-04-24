// src/app/api/admin/libraries/search/route.ts
//
// Plex typeahead search for NewShareForm step-2. Plan §D.1 / §A.9.
// - Gate: requireAdmin().
// - Query validation: unicode letters/digits/whitespace + safe punctuation
//   only, 2–100 chars. `<` / `>` explicitly rejected.
// - Rate-limit: 30/min per admin (0.5 tokens/sec refill).
// - sectionId narrows to /library/sections/<id>/all?title=<q>.

import { NextResponse } from 'next/server';

import { requireAdmin } from '@/auth/guards';
import { rateLimit } from '@/lib/ratelimit';
import { searchPlex } from '@/plex/search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUERY_RE = /^[\p{L}\p{N}\s\-_.,:'"!?&()]{2,100}$/u;

export async function GET(request: Request): Promise<NextResponse> {
  let session;
  try {
    session = await requireAdmin();
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  if (!QUERY_RE.test(q)) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  if (q.includes('<') || q.includes('>')) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }

  if (!rateLimit(`plex-search:${session.sub}`, 30, 0.5)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const sectionId = url.searchParams.get('sectionId') ?? undefined;

  try {
    const items = await searchPlex({ query: q, sectionId, limit: 15 });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'plex_upstream' }, { status: 502 });
  }
}
