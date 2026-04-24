/**
 * share-device-lock.spec.ts — single Playwright integration spec
 *
 * Scope (plan §C-Group-E-E2, spec §12.2 steps 4–6, adapted):
 *   1. Seed a share row via the test-only `/api/test/_seed` route.
 *   2. Browser context A opens `/s/<token>` → pre-claim page renders with a
 *      "Start streaming" button. Clicking triggers the claim server action,
 *      which sets the device-lock cookie and re-renders the player.
 *   3. Browser context B (fresh, no cookie) opens `/s/<token>` → redirected
 *      to `/s/<token>/claimed`.
 *
 * Skip policy: if the Next.js webServer fails to boot in CI, this spec
 * self-skips at the hook level via the `webServer` healthcheck timeout in
 * playwright.config.ts. To force-skip locally, set `SKIP_INTEGRATION=1`.
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

    // 2. Context A opens the share URL — should land on the pre-claim page.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const respA = await pageA.goto(`/s/${token}`, { waitUntil: 'domcontentloaded' });
    expect(respA?.status(), 'context A should get 200').toBe(200);

    // Pre-claim screen shows a "Start streaming" CTA. Click it to trigger the
    // claim server action; the redirect back to the same URL re-renders with
    // the player (the device-lock cookie is now set).
    const cta = pageA.getByRole('button', { name: /start streaming/i });
    await expect(cta).toBeVisible();
    await Promise.all([
      pageA.waitForURL(new RegExp(`/s/${token.replace(/[.]/g, '\\.')}$`)),
      cta.click(),
    ]);

    const video = pageA.locator('video');
    await expect(video).toHaveCount(1);
    const src = await video.getAttribute('src');
    expect(src).toMatch(/^\/api\/hls\/.+\/index\.m3u8/);

    // 3. Context B (fresh cookie jar) opens the same share URL — should be
    // redirected to /claimed. Playwright follows redirects automatically.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/s/${token}`, { waitUntil: 'domcontentloaded' });
    await expect(pageB).toHaveURL(new RegExp(`/s/${token.replace(/[.]/g, '\\.')}/claimed$`));
    await expect(pageB.getByRole('heading', { name: /already claimed/i })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});
