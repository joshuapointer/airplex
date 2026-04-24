import type { APIRequestContext } from '@playwright/test';

/**
 * Integration fixtures for the device-lock spec (plan §C-Group-E-E2).
 *
 * The plan text suggests "open DB via `@/db/client` + `@/db/migrate`, insert
 * a share row". We instead go through the HTTP seed route
 * (`/api/test/_seed`) because:
 *
 *   1. Opening better-sqlite3 from the test process would conflict with the
 *      Next.js server process that holds the WAL — two writers on the same
 *      file is a known pain point.
 *   2. The seed route already reuses `insertShare` + `createShareToken`, so
 *      there is exactly one code path producing shares regardless of caller.
 *   3. It keeps `NODE_ENV=test` as the single gate for the helper.
 *
 * The direct-DB-access variant is documented here (see `seedViaDb`) so a
 * future maintainer can switch if needed.
 */

export interface SeededShare {
  token: string;
  linkId: string;
  shareUrl: string;
}

export async function seedShare(
  request: APIRequestContext,
  init: {
    ratingKey?: string;
    title?: string;
    recipient_label?: string;
    sender_label?: string;
    poster_path?: string;
  } = {},
): Promise<SeededShare> {
  const res = await request.post('/api/test/_seed', {
    data: init,
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`failed to seed share: ${res.status()} ${res.statusText()} — ${body}`);
  }
  const json = (await res.json()) as {
    id: string;
    token: string;
    shareUrl: string;
  };
  return { linkId: json.id, token: json.token, shareUrl: json.shareUrl };
}

/**
 * Alternative seeding path, kept for documentation. NOT wired into any spec.
 * Using this requires `DATABASE_URL` + env secrets to be loadable in the
 * test process (they normally are, because Playwright inherits the shell env,
 * but the webServer env map in `playwright.config.ts` is only applied to
 * the spawned Next.js server). Do not use without care.
 */
export async function seedViaDb(): Promise<never> {
  throw new Error('seedViaDb is a documentation placeholder; use seedShare(request, ...) instead');
}
