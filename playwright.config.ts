import { defineConfig } from '@playwright/test';
import path from 'node:path';

/**
 * Playwright config for airplex integration tests (plan §C-Group-E-E2, spec §12.2).
 *
 * Approach (pragmatic MVP): we do NOT boot a real OIDC IdP. Instead:
 *   - the test server runs with `NODE_ENV=test` so the test-only seeding
 *     route (`/api/test/_seed`) is active;
 *   - tests seed a share row directly over that route, then exercise
 *     `/s/[token]` claim + second-device-rejection.
 *
 * The Plex stub is launched per-test from `tests/integration/stubs/plex.ts`,
 * but `PLEX_BASE_URL` in the webServer env is also a valid http URL so env
 * validation passes at boot (env only needs URL validity, not reachability).
 * `/s/[token]` itself never calls Plex — that only happens on the HLS
 * manifest route, which we do not exercise in this spec.
 */

const APP_URL = 'http://localhost:3100';
const TEST_DB_PATH = path.resolve(__dirname, '.playwright-tmp/airplex-test.db');

// A dummy 32-byte secret (hex) — decodes to exactly 32 bytes so env validation
// in `src/lib/env.ts` accepts it. Do NOT reuse in production.
const DUMMY_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export default defineConfig({
  testDir: 'tests/integration',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  webServer: {
    // `npm run start` runs the standalone server which defaults to port 3000,
    // so PORT is set here to route traffic to the same port Playwright dials.
    command: 'npm run build && npm run start',
    url: `${APP_URL}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      PORT: '3100',
      HOSTNAME: '127.0.0.1',

      APP_URL,
      DATABASE_URL: `file:${TEST_DB_PATH}`,

      // Plex: env validation only needs a valid URL. `/s/[token]` never calls
      // Plex; the Plex stub is used only by the HLS route (not exercised here).
      PLEX_BASE_URL: 'http://127.0.0.1:59999',
      PLEX_TOKEN: 'test-plex-token',
      PLEX_CLIENT_IDENTIFIER: 'airplex-integration',

      SESSION_SECRET: DUMMY_SECRET,
      DEVICE_LOCK_SECRET: DUMMY_SECRET,
      SHARE_TOKEN_SECRET: DUMMY_SECRET,

      // OIDC: discovery is lazy (only hit during /api/auth/login). We never
      // log in for this spec, so a dummy issuer URL is fine.
      OIDC_ISSUER_URL: 'http://127.0.0.1:59998',
      OIDC_CLIENT_ID: 'airplex-test',
      OIDC_CLIENT_SECRET: 'airplex-test-secret',
      OIDC_ADMIN_GROUPS: '',

      LOG_LEVEL: 'warn',
      TRUST_PROXY: 'false',
    },
  },
});
