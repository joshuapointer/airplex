import { describe, it, expect } from 'vitest';

describe('env', () => {
  it('imports @/lib/env without throwing under test setup vars', async () => {
    // setup.ts has already set all required env vars; if import throws,
    // it means env validation failed.
    const { env } = await import('@/lib/env');
    expect(env).toBeDefined();
    expect(typeof env.APP_URL).toBe('string');
    expect(env.APP_URL).toBe('http://localhost:3000');
  });

  it('exposes expected env vars with correct values', async () => {
    const { env } = await import('@/lib/env');
    expect(env.NODE_ENV).toBe('test');
    expect(env.PLEX_BASE_URL).toBe('http://localhost:32400');
    expect(env.PLEX_TOKEN).toBe('test-token');
    expect(env.PLEX_CLIENT_IDENTIFIER).toBe('airplex-test');
    expect(env.OIDC_ISSUER_URL).toBe('http://localhost:9999');
    expect(env.OIDC_CLIENT_ID).toBe('id');
    expect(env.OIDC_CLIENT_SECRET).toBe('secret');
    expect(env.DATABASE_URL).toBe('file::memory:');
  });

  it('OIDC_REDIRECT_URI defaults to APP_URL + /api/auth/callback', async () => {
    const { env } = await import('@/lib/env');
    expect(env.OIDC_REDIRECT_URI).toBe('http://localhost:3000/api/auth/callback');
  });

  it('OIDC_ADMIN_GROUPS defaults to empty array', async () => {
    const { env } = await import('@/lib/env');
    expect(Array.isArray(env.OIDC_ADMIN_GROUPS)).toBe(true);
    expect(env.OIDC_ADMIN_GROUPS).toHaveLength(0);
  });
});
