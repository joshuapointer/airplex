import { type NextRequest } from 'next/server';
import { env } from '@/lib/env';

/**
 * Extract the real client IP from a Next.js route-handler request.
 *
 * Honors `TRUST_PROXY`: only reads `x-forwarded-for` when the flag is set,
 * to prevent IP spoofing when the server is exposed directly to the internet.
 * Falls back to `'unknown'` when the IP cannot be determined.
 *
 * NOTE: This helper is for Node-runtime route handlers only. The edge
 * middleware (`src/middleware.ts`) has its own copy because the edge runtime
 * cannot import Node-only modules that are transitively pulled in by env.ts.
 */
export function extractClientIp(req: NextRequest): string {
  if (env.TRUST_PROXY) {
    const xff = req.headers.get('x-forwarded-for');
    const first = xff?.split(',')[0]?.trim();
    if (first && first.length > 0) return first;
  }
  return 'unknown';
}
