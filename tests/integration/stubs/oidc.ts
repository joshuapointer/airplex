/**
 * Integration-test OIDC "stub" (spec §12.2 step 2 — simplified).
 *
 * We do NOT boot a real OIDC IdP. The device-lock flow on `/s/[token]` is the
 * entire scope of this integration spec and does not require admin auth —
 * the share row is seeded directly via the test-only `/api/test/_seed` route
 * (see `src/app/api/test/_seed/route.ts`, guarded by `NODE_ENV === 'test'`).
 *
 * This file is therefore intentionally a documentation stub. If a future
 * spec needs a real OIDC login, replace the no-op below with a call to
 * `node-oidc-provider` or similar and export a `startOidcStub()` helper
 * that returns `{ url, stop }` analogous to `startPlexStub()`.
 */

export interface OidcStubHandle {
  url: string;
  stop(): Promise<void>;
}

/**
 * Placeholder: returns a handle that does nothing. Tests that want to log in
 * as admin should call into `/api/auth/login` against a real IdP; for the
 * current spec we bypass login entirely.
 */
export async function startOidcStub(): Promise<OidcStubHandle> {
  return {
    url: 'http://127.0.0.1:0',
    async stop() {
      /* noop */
    },
  };
}
