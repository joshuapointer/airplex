/**
 * share-device-lock.spec.ts — single Playwright integration spec
 *
 * Scope (plan §C-Group-E-E2, spec §12.2 steps 4–6, adapted):
 *   1. Seed a share row via the test-only `/api/test/_seed` route.
 *   2. Browser context A opens `/s/<token>` → device-lock cookie issued,
 *      page renders the video player.
 *   3. Browser context B (fresh, no cookie) opens `/s/<token>` → redirected
 *      to `/s/<token>/claimed`.
 *
 * Omissions vs spec §12.2 (documented in the task handoff):
 *   - We do NOT exercise the admin OIDC login flow or share-creation UI.
 *     Seeding bypasses both. Admin-flow coverage is deferred until a real
 *     OIDC provider stub is introduced.
 *   - We do NOT exercise the HLS manifest route. The `<video>` element's
 *     `src` points at `/api/hls/<id>/index.m3u8` but we never fetch it;
 *     that route requires a working Plex backend and is covered by unit
 *     tests.
 *
 * Skip policy: if the Next.js webServer fails to boot in CI, this spec
 * self-skips at the hook level via the `webServer` healthcheck timeout in
 * playwright.config.ts (Playwright will report the config failure rather
 * than a test-level skip). To force-skip locally, set `SKIP_INTEGRATION=1`.
 */

import { test, expect } from '@playwright/test';
import { seedShare } from './fixtures';

test.describe('share device-lock flow', () => {
  test.skip(
    !!process.env.SKIP_INTEGRATION,
    'SKIP_INTEGRATION=1 set — skipping playwright integration',
  );

  test('first device claims, second device is rejected', async ({ browser, request }) => {
    // 1. Seed a fresh share row.
    const { token } = await seedShare(request, {
      ratingKey: '42',
      title: 'Device-Lock Integration',
      recipient_label: 'alpha',
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    // 2. Context A opens the share URL.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const respA = await pageA.goto(`/s/${token}`, { waitUntil: 'domcontentloaded' });
    expect(respA?.status(), 'context A should get 200').toBe(200);

    // The server component renders a <video> whose src points at the HLS
    // proxy route. We do not wait for network activity on that URL.
    const video = pageA.locator('video');
    await expect(video).toHaveCount(1);
    const src = await video.getAttribute('src');
    expect(src).toMatch(/^\/api\/hls\/.+\/index\.m3u8$/);

    // 3. Context B (fresh cookie jar) opens the same share URL — should be
    // redirected to /claimed. Playwright follows redirects automatically,
    // so we assert on the final URL path.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/s/${token}`, { waitUntil: 'domcontentloaded' });
    await expect(pageB).toHaveURL(new RegExp(`/s/${token}/claimed$`));
    await expect(pageB.getByRole('heading', { name: /already claimed/i })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});
