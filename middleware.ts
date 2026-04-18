import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/ratelimit';

/**
 * Edge middleware for airplex. Source of truth: plan §C-C1.
 *
 * Responsibilities (route-gating only — DB / token checks happen in route
 * handlers because edge has no sqlite access):
 *
 *   1. `/dashboard/:path*` and `/api/admin/:path*` → require `airplex_session`
 *      cookie; otherwise 302 to `/login?returnTo=<encoded pathname+search>`.
 *   2. `/api/hls/:path*` → rate-limit 60 req/min per IP. Throttled → 429
 *      JSON `{error:'rate_limited'}`.
 *   3. `/s/:path*` → rate-limit 30 req/min per IP. Also sets
 *      `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and
 *      `Content-Security-Policy: frame-ancestors 'none'` on the response.
 *   4. `/dashboard/:path*` → adds `Content-Security-Policy: frame-ancestors
 *      'none'`.
 *
 * IP extraction honors `env.TRUST_PROXY`: only parse `x-forwarded-for` when
 * true; otherwise fall back to `request.ip` (Next runtime) / `'unknown'`.
 */

const ADMIN_SESSION_COOKIE = 'airplex_session';

/** 60 requests per minute → refill at 1 token/sec, cap 60. */
const HLS_CAPACITY = 60;
const HLS_REFILL_PER_SEC = 60 / 60;

/** 30 requests per minute → refill at 0.5 tokens/sec, cap 30. */
const SHARE_CAPACITY = 30;
const SHARE_REFILL_PER_SEC = 30 / 60;

const CSP_FRAME_ANCESTORS_NONE = "frame-ancestors 'none'";

function extractClientIp(request: NextRequest): string {
  if (env.TRUST_PROXY) {
    const xff = request.headers.get('x-forwarded-for');
    const first = xff?.split(',')[0]?.trim();
    if (first && first.length > 0) return first;
  }
  // `NextRequest.ip` was removed from the public types in Next 15 but can
  // still be populated by some deployment adapters. Access defensively.
  const maybeIp = (request as unknown as { ip?: string }).ip;
  return maybeIp && maybeIp.length > 0 ? maybeIp : 'unknown';
}

function rateLimitedJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited' },
    {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function applyShareHeaders(res: NextResponse): void {
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Content-Security-Policy', CSP_FRAME_ANCESTORS_NONE);
}

function applyDashboardHeaders(res: NextResponse): void {
  res.headers.set('Content-Security-Policy', CSP_FRAME_ANCESTORS_NONE);
}

function redirectToLogin(request: NextRequest): NextResponse {
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const loginUrl = new URL('/login', request.nextUrl);
  loginUrl.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith('/dashboard');
  const isAdminApi = pathname.startsWith('/api/admin');
  const isHls = pathname.startsWith('/api/hls');
  const isShare = pathname.startsWith('/s/') || pathname === '/s';

  // 1. Auth-gate admin surfaces.
  if (isDashboard || isAdminApi) {
    const hasSession = request.cookies.has(ADMIN_SESSION_COOKIE);
    if (!hasSession) {
      return redirectToLogin(request);
    }
  }

  // 2. HLS rate limiting.
  if (isHls) {
    const ip = extractClientIp(request);
    const allowed = rateLimit(`hls:${ip}`, HLS_CAPACITY, HLS_REFILL_PER_SEC);
    if (!allowed) {
      return rateLimitedJsonResponse();
    }
    return NextResponse.next();
  }

  // 3. Share page rate limiting + security headers.
  if (isShare) {
    const ip = extractClientIp(request);
    const allowed = rateLimit(`share:${ip}`, SHARE_CAPACITY, SHARE_REFILL_PER_SEC);
    if (!allowed) {
      return rateLimitedJsonResponse();
    }
    const res = NextResponse.next();
    applyShareHeaders(res);
    return res;
  }

  // 4. Dashboard CSP (when the session check above passed).
  if (isDashboard) {
    const res = NextResponse.next();
    applyDashboardHeaders(res);
    return res;
  }

  return NextResponse.next();
}

/**
 * Match everything except static assets and the public health endpoint.
 * Standard Next 15 negative-lookahead pattern.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg|og\\.png|api/health).*)'],
};
