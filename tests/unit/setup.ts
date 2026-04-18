// tests/unit/setup.ts
// MUST set env vars before any app module is imported.
// This file is loaded by vitest as a setupFile — runs before each test module.

// NODE_ENV is read-only in Node typedefs; cast via index notation to set before module load.
(process.env as Record<string, string>)['NODE_ENV'] = 'test';
process.env['SESSION_SECRET'] = 'a'.repeat(64); // 64 hex chars = 32 bytes
process.env['DEVICE_LOCK_SECRET'] = 'b'.repeat(64);
process.env['SHARE_TOKEN_SECRET'] = 'c'.repeat(64);
process.env['APP_URL'] = 'http://localhost:3000';
process.env['DATABASE_URL'] = 'file::memory:';
process.env['PLEX_BASE_URL'] = 'http://localhost:32400';
process.env['PLEX_TOKEN'] = 'test-token';
process.env['PLEX_CLIENT_IDENTIFIER'] = 'airplex-test';
process.env['OIDC_ISSUER_URL'] = 'http://localhost:9999';
process.env['OIDC_CLIENT_ID'] = 'id';
process.env['OIDC_CLIENT_SECRET'] = 'secret';
