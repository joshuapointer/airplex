# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Prereq: Node 22+. For local dev, create `.env.local` with `APP_URL=http://localhost:3000` and `DATABASE_URL=file:./data/dev.db` (plus the three 32-byte secrets — `npm run gen-secrets`).

- `npm run dev` — Next.js dev server on port 3000
- `npm run build` — Next.js production build (standalone output)
- `npm run start` — run built standalone server (`node .next/standalone/server.js`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `next lint` + `prettier --check .`
- `npm run test:unit` — Vitest against `tests/unit/` (Node env, excludes `tests/integration/**`)
- Run one unit test: `npx vitest run tests/unit/<file>.test.ts` (or `-t '<name>'`)
- `npm run test:integration` — Playwright; builds then starts on port 3100 with stub env. First run: `npx playwright install chromium`
- `npm run gen-secrets` — print three fresh 32-byte hex secrets for `SESSION_SECRET`, `DEVICE_LOCK_SECRET`, `SHARE_TOKEN_SECRET`
- Docker: `docker compose up -d` (or add `-f docker-compose.jarch.yml` for Traefik/jarch overlay)

## Architecture

Next.js 15 App Router + React 19 + TypeScript strict. Single-process server, SQLite on disk (`better-sqlite3`, WAL, foreign_keys ON). Alias `@/*` → `src/*`. `output: 'standalone'` — Docker runtime copies `.next/standalone`, `.next/static`, `src/db/migrations/`, and `public/` only. Styling: Tailwind + `neopointer-ui` design tokens (CSS-only). Logging: Pino at `LOG_LEVEL`. Rate limiter is in-memory/single-instance — horizontal scaling requires an external limiter.

### Request flow

1. `middleware.ts` (edge): auth-gates `/dashboard/*` + `/api/admin/*` (checks `airplex_session` cookie only — DB validation happens in handlers since edge has no sqlite), token-bucket rate-limits `/api/hls/*` (60/min) and `/s/*` (30/min), sets `Referrer-Policy: no-referrer` + `frame-ancestors 'none'` on share pages. IP from `x-forwarded-for` only when `TRUST_PROXY=true`.
2. Route handlers under `src/app/api/**` run in Node runtime, open the SQLite singleton via `getDb()` (`src/db/client.ts`), and use prepared statements (ESLint rule forbids template literals in `.exec()`/`.prepare()`).
3. Admin session = iron-session encrypted cookie `airplex_session`; device-lock session = per-link iron-session cookie `airplex_device_<linkId>`. Both configs in `src/lib/session.ts` + `src/lib/device-lock.ts`. `secure: true` except in `NODE_ENV=test`.

### Share token crypto (§A.2 / §6)

All share-token crypto lives in `src/lib/share-token.ts` — `createShareToken`, `verifyShareTokenSignature`, `hashShareToken`. Never re-implement in route handlers. Format: `base64url(16 random bytes).base64url(hmac_sha256(SHARE_TOKEN_SECRET, rand)[0:16])`. Constant-time compare via `crypto.timingSafeEqual`. DB stores only `tokenHash` (sha256 of full token).

### HLS proxy + segment encryption

`src/plex/hls-rewriter.ts` rewrites every Plex URI in a manifest to `/api/hls/<linkId>/seg/<blob>` where `<blob>` = base64url(nonce || AES-256-GCM(plexPath) || tag). Per-link key = `sha256(DEVICE_LOCK_SECRET + linkId)`. `stripPlexToken()` removes `X-Plex-Token` before encryption; manifest assertion throws if `X-Plex-Token` ever leaks into output. The proxy handler decrypts the blob, re-attaches the token server-side, streams bytes — token never reaches the browser.

### Device lock (first-device claim)

Atomic SQLite `UPDATE shares SET device_fingerprint_hash = ? WHERE id = ? AND device_fingerprint_hash IS NULL`. Fingerprint = `sha256(UA + '\n' + Accept-Language + '\n' + DEVICE_LOCK_SECRET)[:32]` (keyed so fingerprints aren't portable across deployments). Second device → 403 "already claimed"; admin can reset from dashboard.

### Database

SQLite only, file-based. `DATABASE_URL` must start with `file:`; special `file::memory:` allowed in `NODE_ENV=test`. `src/db/migrate.ts` applies sorted `.sql` files from `src/db/migrations/` in a single transaction, tracked in `_migrations` table. Migrations resolved via `process.cwd()` so the same relative path works in dev and standalone Docker. Queries in `src/db/queries/{shares,events,settings}.ts`.

### Env validation

`src/lib/env.ts` — zod schema, parsed once at import. All secrets validated to decode (hex OR base64) to ≥32 bytes. `OIDC_REDIRECT_URI` must start with `APP_URL`. `PLEX_BASE_URL`/`PLEX_TOKEN` are optional — admin can complete Plex PIN OAuth at `/setup/plex` which persists into the `settings` table (settings table supersedes env when present). No variable may use `NEXT_PUBLIC_` prefix — everything is server-only. Never read `process.env.*` elsewhere; import from `env`.

### OIDC

`src/auth/oidc.ts` — `openid-client` v5, Issuer discovered lazily and cached in a module singleton (one discovery round-trip per process). PKCE + state + nonce. Login state persisted in 5-min `airplex_oidc` iron-session cookie between `/api/auth/login` and `/api/auth/callback`. Group check against `OIDC_ADMIN_GROUPS` when non-empty; claim name configurable via `OIDC_GROUPS_CLAIM`.

### Plex integration

`src/plex/` — `client.ts` (HTTP wrapper injecting `X-Plex-Token`/`X-Plex-Client-Identifier`), `libraries.ts`/`metadata.ts` (browsing), `transcode.ts` (universal transcode session start), `hls-rewriter.ts` (manifest rewriting, segment blob crypto), `account.ts` + `config.ts` (PIN OAuth flow and DB-backed settings resolution). The PIN is created client-side in the browser to avoid Plex's "IP mismatch" alert (see commit `4c26ed6`).

## Testing

- **Unit (Vitest, `tests/unit/`)** — Node env, `tests/unit/setup.ts` preloads a dummy env. Covers share-token crypto, device-lock helpers, HLS rewriter round-trip + tamper rejection, Plex header injection, env validation, DB queries.
- **Integration (Playwright, `tests/integration/`)** — no real OIDC or Plex. Server boots with `NODE_ENV=test` which enables `/api/test/_seed` for direct share-row seeding; integration then drives `/s/[token]` claim + second-device rejection. Runs serial (`workers: 1`), webServer on `:3100`, dummy 32-byte secrets in the Playwright config (never reuse). New integration tests should `POST /api/test/_seed` to insert rows rather than driving the full admin OIDC flow.

## Conventions specific to this repo

- Don't pass template literals to `better-sqlite3` `.exec()`/`.prepare()` — ESLint `no-restricted-syntax` rule blocks it. Use prepared statements with bound params.
- Share-token crypto is centralized — re-implementing `randomBytes(16)` / HMAC in a route handler is a plan violation (see §F regression check).
- HLS manifest output is asserted to never contain `X-Plex-Token`; both `encodeSegmentBlob` and `rewriteManifest` throw if it does.
- `NEXT_PUBLIC_*` is banned. All config is server-only.
- All share pages + dashboard get `Referrer-Policy: no-referrer` and `frame-ancestors 'none'` at the `next.config.ts` headers layer AND in middleware (defense in depth).
- `next-env.d.ts` is git-ignored from edits; `tsconfig.check.tsbuildinfo` / `tsconfig.tsbuildinfo` are build artifacts — don't commit edits to them.

## Deployment

Docker Compose is the primary deploy target (`docker-compose.yml`). Overlay `docker-compose.jarch.yml` wires Traefik labels for the jarch-bootstrap stack (requires external `jarch-public` network). Full provisioning via Ansible role in `ansible/` (see `ansible/README.md`); data dir owned by `1000:1000` to match container user.
