# Architecture

airplex is a single-process Next.js 15 (App Router) application backed by SQLite. The whole thing fits in a container that runs on port 3000. This document describes how requests flow through the system and where the non-obvious invariants live.

```
  recipient (iOS Safari)
        │ HTTPS
        ▼
  Cloudflare (DNS + edge)
        │
        ▼
  Traefik (TLS, HTTP/2) ──► airplex:3000
                               │
                               ├── Edge middleware (auth gate, rate limit, security headers)
                               │
                               ├── RSC / route handlers
                               │   ├── share page  /s/[token]
                               │   ├── HLS proxy   /api/hls/[link_id]/...
                               │   └── admin API   /api/admin/*
                               │
                               ├── SQLite (WAL, foreign_keys=ON)
                               │
                               └── Plex Media Server  (X-Plex-Token injected here; never leaves)
```

## Tech stack

- **Next.js 15 (App Router)** — RSC + route handlers + edge middleware. `output: 'standalone'` so the Docker image only ships `.next/standalone` + `.next/static`.
- **React 19** — server components by default, client components opted in with `'use client'`.
- **TypeScript strict**, alias `@/*` → `src/*`.
- **`better-sqlite3`** — synchronous SQLite, WAL mode, `foreign_keys=ON` for app traffic (OFF during migrations — see below).
- **`iron-session` v8** — encrypted cookies. Two independent session configs:
  - `airplex_session` — admin OIDC session (password = `SESSION_SECRET`)
  - `airplex_device_<linkId>` — per-link device-lock cookie (password = `DEVICE_LOCK_SECRET`)
- **`openid-client` v5** — OIDC authorization-code + PKCE.
- **`hls.js`** — client-side HLS for browsers without native support; iOS Safari uses native via `<video src>`.
- **`zod`** — env validation and request-body parsing.
- **`pino`** — structured logs. Never logs `X-Plex-Token` or share tokens.

## Request flow

### Middleware (`src/middleware.ts`)

Runs at the edge for everything except static assets and `/api/health`. Handles:

1. **Auth gate** for `/dashboard/*`, `/api/admin/*`, `/setup/*`, `/api/setup/*` — checks the `airplex_session` cookie presence only. DB validation happens in the route handler (edge has no SQLite).
2. **Rate limiting** for `/api/hls/*` (60/min) and `/s/*` (30/min). Token bucket in memory per IP; single-instance limiter (document this if you ever horizontally scale).
3. **Security headers** on share pages: `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`.

The middleware file must live at `src/middleware.ts`, not the project root — Next 15 silently ignores a root-level `middleware.ts` when the project uses a `src/` layout.

### Route handlers and RSCs

Node runtime, direct SQLite access. Two guard helpers in `src/auth/guards.ts`:

- `requireAdmin()` — checks the admin session. Throws a `NextResponse` with a 302 redirect to `/login`. **Must only be called from route handlers or server actions** (cookie semantics). The share page's claim flow uses a server action for exactly this reason.
- `requireShareAccess()` — validates that the caller holds the device-lock cookie for the given `linkId`. Used by every `/api/hls/*` route.

### Share claim flow (`src/app/s/[token]/page.tsx`)

1. Signature gate on the token (`verifyShareTokenSignature`) — cheap reject before any DB hit.
2. Row lookup by `hashShareToken(token)` (sha256). Not-found → 404.
3. Status gate — revoked / expired / exhausted → `/s/[token]/expired`.
4. Bot bypass — link-preview bots (iMessage, Discord, Slack, etc.) get a minimal page that does not touch DB state. Without this guard, a bot claims the share and the real recipient gets "already claimed" on first visit.
5. If the caller already holds the device cookie matching the committed fingerprint → render the `ShareWatcher` client component.
6. If someone else holds it → redirect to `/s/[token]/claimed`.
7. If unclaimed → render a "Start streaming" button backed by a server action. The server action runs `claimDevice()` (atomic `UPDATE ... WHERE device_fingerprint_hash IS NULL`), sets the device cookie, and redirects back to `/s/[token]` which then renders the player.

### HLS proxy (`/api/hls/[link_id]/*`)

- `index.m3u8` — calls `buildStartUrl()` (transcode start URL with full X-Plex-* device set + `location=lan`), proxies the request, and runs the result through `rewriteManifest()`. Accepts `?rk=<episode>` for show-level shares to override `plex_rating_key`.
- `seg/[...path]` — decodes the AES-256-GCM blob back to the original Plex path, proxies, re-rewrites if the response is itself an m3u8 (nested playlists with relative `.ts` URIs).
- `ping` — keep-alive for the Plex transcode session.
- `episodes` — for show-typed shares, lists seasons + episodes via `getChildren()`.
- `resume` — GET/POST saved playback position per `(share_id, rating_key)`.

### Crypto invariants

- **Share tokens** live in `src/lib/share-token.ts` only. Format: `base64url(16 random bytes).base64url(hmac_sha256(SHARE_TOKEN_SECRET, rand)[0:16])`. Verification uses `crypto.timingSafeEqual`. DB stores only `tokenHash` (sha256 of the full token) — never the plaintext token.
- **Segment blobs** are AES-256-GCM ciphertext of the Plex-relative path. Per-link key = `sha256(DEVICE_LOCK_SECRET + linkId)` — rotating the link id rotates the key. `stripPlexToken()` removes `X-Plex-Token` before encryption; both `encodeSegmentBlob()` and `rewriteManifest()` assert the token never leaks into output.
- **Device fingerprint** = `sha256(UA + '\n' + Accept-Language + '\n' + DEVICE_LOCK_SECRET)[:32]`. Keyed with the secret so fingerprints aren't portable across deployments.

## Database

SQLite file at `DATABASE_URL` (must start with `file:`). The special `file::memory:` is allowed only in `NODE_ENV=test`.

Migrations in `src/db/migrations/` are applied in sorted filename order. A single transaction per run, tracked in `_migrations`. `process.cwd()` resolves the migrations path so the same relative location works in both dev and the standalone Docker build.

Two places handle migrations:

- `src/db/migrate.ts` — `runMigrations()` called by dev harness and tests.
- `scripts/migrate-runtime.cjs` — standalone CJS runner invoked by `docker/entrypoint.sh` at container boot, before the server starts. Pure CJS so it works inside the runtime image without `tsx`.

Both set `foreign_keys = OFF` and `legacy_alter_table = ON` during migration. The first is necessary to DROP parent tables cleanly; the second prevents `ALTER TABLE ... RENAME` from rewriting child-table FK references out from under us (a hazard in SQLite ≥ 3.26 defaults). The application path re-enables `foreign_keys = ON` in `src/db/client.ts`.

### Schema overview

- `shares` — one row per share link. `plex_media_type` is `movie | episode | show`. `device_fingerprint_hash` is null until first claim, then permanent until admin resets.
- `share_events` — audit trail (created, claimed, play, rejected_device, expired, revoked, reset).
- `settings` — key/value runtime config populated by `/setup/plex` (PIN OAuth flow). Values here supersede env for Plex base URL / token.
- `resume_positions` — `(share_id, rating_key)` → `position_ms`, `duration_ms`. FK cascade delete with `shares`.

## Environment validation

`src/lib/env.ts` — one zod schema parsed once at import. All secrets must decode (hex or base64) to ≥32 bytes. `OIDC_REDIRECT_URI` must start with `APP_URL`. `PLEX_BASE_URL` and `PLEX_TOKEN` are optional — admin can complete the PIN OAuth flow at `/setup/plex` which writes to the `settings` table.

No other module reads `process.env.*` directly. Import `env` from `@/lib/env`.

## Config resolution priority for Plex

`src/plex/config.ts` is the single authority:

1. `settings` table value (written by `/setup/plex`)
2. Env fallback (for compose deployments pre-OAuth)

All Plex HTTP lives in `src/plex/client.ts` (`plexFetch`, `plexJson`). Only this module attaches `X-Plex-Token`. Headers — never URL params — so the token never shows up in logs.

## OIDC

`src/auth/oidc.ts` discovers the issuer lazily and caches the client in a module singleton (one discovery round-trip per process). PKCE + state + nonce. Login state is persisted in a 5-minute `airplex_oidc` iron-session cookie between `/api/auth/login` and `/api/auth/callback`. Group membership enforced against `OIDC_ADMIN_GROUPS` when non-empty.

## Build and deploy

Dockerfile is a three-stage build:

1. **deps** — `npm ci --ignore-scripts` with native build tools.
2. **build** — copies source, runs `npm rebuild better-sqlite3`, sets build-time ARG stubs so Next's page-data collection doesn't reject the env schema, then `next build`.
3. **runtime** — `.next/standalone` + `.next/static` + `public/` + `src/db/migrations/` + `scripts/migrate-runtime.cjs` + enough of `node_modules/better-sqlite3` for the runtime migrate script. Runs as uid 1000 via `docker/entrypoint.sh` (which also chowns `/data` if started root).

The Ansible role in `ansible/roles/airplex/` provisions a remote host from a pre-built registry image. For single-host "build locally and run" deployments, use the `docker-compose.jarch.yml` overlay (Traefik labels for `jarch-public` network + `letsencrypt` resolver) or write your own overlay.

## Further reading

- `spec.md` — product-level spec
- Section `§A.*` markers in source comments — the original plan sections; useful when following a code path's rationale
- `CLAUDE.md` — terse summary aimed at the Claude Code agent; overlaps with this doc but is meant as in-context guidance rather than long-form
