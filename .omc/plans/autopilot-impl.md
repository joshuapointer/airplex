# airplex — Autopilot Phase 2 Implementation Plan

> Execution contract for parallel executor agents. Read the spec at
> `/home/joshpointer/developer/airplex/.omc/autopilot/spec.md` for
> any detail not pinned here. All paths are absolute-from-repo-root under
> `/home/joshpointer/developer/airplex/`. All tasks MUST conform to the
> shared interfaces in §A and env contract in §D before writing code.

---

## Table of contents

- §A Shared TypeScript interfaces (single source of truth)
- §B Task graph (ASCII + group rules)
- §C Task list (ID, files, deps, tier, acceptance, interface)
- §D Environment contract
- §E Commands (Phase 3 QA runbook)
- §F Critical correctness notes (parallel-execution failure modes)
- §G Out-of-scope / deferred

---

## §A Shared TypeScript interfaces

Every task that touches these shapes MUST import/re-declare them identically.
Interface owner tasks are noted in `[owner: Xn]`. Other tasks consume.

### A.1 DB row types  `[owner: B1 — src/types/share.d.ts]`

```ts
// src/types/share.d.ts
export type ShareMediaType = 'movie' | 'episode';

export interface ShareRow {
  id: string;                           // nanoid(12) link_id
  token_hash: string;                   // hex sha256(full_token)
  plex_rating_key: string;
  title: string;
  plex_media_type: ShareMediaType;
  recipient_label: string;
  recipient_note: string | null;
  created_at: number;                   // unix seconds
  expires_at: number;
  max_plays: number | null;
  play_count: number;
  device_fingerprint_hash: string | null;
  device_locked_at: number | null;
  revoked_at: number | null;
  created_by_sub: string;
}

export type ShareEventKind =
  | 'created' | 'claimed' | 'play'
  | 'rejected_device' | 'expired' | 'revoked' | 'reset';

export interface ShareEventRow {
  id: number;
  share_id: string;
  at: number;
  kind: ShareEventKind;
  ip_hash: string | null;
  ua_hash: string | null;
  detail: string | null;                // JSON blob
}

export interface ShareStatus {
  active: boolean;
  expired: boolean;
  revoked: boolean;
  exhausted: boolean;                   // play_count >= max_plays
  claimed: boolean;                     // device_fingerprint_hash != null
}
```

### A.2 Share token  `[owner: B3 — src/lib/share-token.ts]`

```ts
// src/lib/share-token.ts — PUBLIC API
export interface IssuedShareToken {
  token: string;       // full "<rand>.<mac>" string, ~45 chars
  tokenHash: string;   // hex sha256(token) — store in shares.token_hash
}

export function createShareToken(): IssuedShareToken;
export function verifyShareTokenSignature(token: string): boolean;
export function hashShareToken(token: string): string;   // hex sha256
```

Implementation contract:
- Random half: `crypto.randomBytes(16)` → `base64url`.
- Signature half: `crypto.createHmac('sha256', SHARE_TOKEN_SECRET).update(rand).digest().subarray(0, 16)` → `base64url`.
- `verifyShareTokenSignature` uses `crypto.timingSafeEqual` on the decoded 16 bytes.
- `hashShareToken` returns `crypto.createHash('sha256').update(token).digest('hex')`.

### A.3 Device-lock cookie  `[owner: B4 — src/lib/device-lock.ts]`

```ts
// src/lib/device-lock.ts — PUBLIC API
export interface DeviceLockCookiePayload {
  link_id: string;
  device_fp: string;   // 32-char hex (16 bytes truncated)
  issued_at: number;   // unix seconds
}

export function cookieNameFor(linkId: string): string;               // `airplex_device_${linkId}`
export function ironConfigFor(linkId: string, ttlSeconds: number): IronSessionOptions;
export function computeDeviceFp(userAgent: string, acceptLanguage: string): string;
```

### A.4 Admin session  `[owner: B6 — src/lib/session.ts]`

```ts
export interface AdminSessionData {
  sub: string;               // OIDC sub claim
  email?: string;
  name?: string;
  groups?: string[];
  issued_at: number;
  csrf: string;              // double-submit token, 32 hex
}

export const ADMIN_SESSION_COOKIE = 'airplex_session';
export function adminIronConfig(): IronSessionOptions;
export async function getAdminSession(): Promise<IronSession<AdminSessionData>>;
```

### A.5 Plex response types  `[owner: B2 — src/types/plex.d.ts]`

```ts
// src/types/plex.d.ts
export interface PlexDirectory {
  key: string; title: string; type: 'movie' | 'show' | 'artist' | 'photo';
}
export interface PlexMediaContainerSections { MediaContainer: { Directory: PlexDirectory[] } }

export interface PlexMetadata {
  ratingKey: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  title: string;
  parentTitle?: string;
  grandparentTitle?: string;
  duration?: number;
  Media?: { Part?: { file: string; key: string }[] }[];
}
export interface PlexMetadataContainer { MediaContainer: { Metadata?: PlexMetadata[]; size?: number; totalSize?: number } }

export interface PlexTranscodeStartParams {
  ratingKey: string;
  linkId: string;              // used as session id
  maxVideoBitrate?: number;    // default 20000
}
```

### A.6 HLS rewriter  `[owner: B5 — src/plex/hls-rewriter.ts]`

```ts
// src/plex/hls-rewriter.ts — PUBLIC API
export interface RewriteArgs {
  manifest: string;            // raw m3u8 text from Plex
  linkId: string;
  plexBaseUrl: string;         // to resolve relative URIs
}
export interface RewriteResult {
  manifest: string;            // rewritten m3u8
  segments: number;            // count of rewritten URIs (for tests)
}

export function rewriteManifest(args: RewriteArgs): RewriteResult;
export function encodeSegmentBlob(originalPath: string, linkId: string): string;
export function decodeSegmentBlob(blob: string, linkId: string): string;
```

Blob encoding: AES-256-GCM with key `sha256(DEVICE_LOCK_SECRET + linkId)`, nonce 12 bytes random, base64url-encoded `nonce||ciphertext||tag`. NEVER include `X-Plex-Token` in the plaintext; token is re-attached server-side at proxy time.

### A.7 Plex client  `[owner: B2 — src/plex/client.ts]`

```ts
// src/plex/client.ts — PUBLIC API
export interface PlexRequestOptions {
  path: string;                         // e.g. '/library/sections'
  query?: Record<string, string | number>;
  method?: 'GET' | 'DELETE';
  accept?: 'json' | 'xml' | 'm3u8';
  stream?: boolean;                     // if true, return Response (for segment proxy)
}
export function plexFetch(opts: PlexRequestOptions): Promise<Response>;
export function plexJson<T>(opts: PlexRequestOptions): Promise<T>;
```

Client always injects `X-Plex-Token`, `X-Plex-Client-Identifier`, `Accept: application/json` unless overridden. Never logs the token.

### A.8 OIDC  `[owner: B6 — src/auth/oidc.ts]`

```ts
// src/auth/oidc.ts — PUBLIC API
export interface OidcLoginState { state: string; codeVerifier: string; nonce: string; returnTo?: string }
export function buildAuthorizationUrl(returnTo?: string): Promise<{ url: string; state: OidcLoginState }>;
export function handleCallback(params: URLSearchParams, state: OidcLoginState): Promise<AdminSessionData>;
```

### A.9 Guards  `[owner: B6 — src/auth/guards.ts]`

```ts
export async function requireAdmin(): Promise<AdminSessionData>;          // throws Response 302 → /login
export async function requireShareAccess(req: Request, linkId: string): Promise<ShareRow>;  // throws 403 JSON
```

---

## §B Task graph

```
Group A (sequential, foundation)
  A1 → A2 → A3 → A4 → A5 → A6

Group B (parallel after A6)
  B1  (db module)          ─┐
  B2  (plex client + types)─┤
  B3  (share-token)        ─┤
  B4  (device-lock)        ─┤
  B5  (hls-rewriter)       ─┤
  B6  (oidc + session)     ─┘

Group C (parallel after all of B)
  C1  (middleware)                       ─┐
  C2  (admin API: libraries)             ─┤
  C3  (admin API: items)                 ─┤
  C4  (admin API: shares)                ─┤
  C5  (share page + claimed/expired)     ─┤
  C6  (HLS proxy routes)                 ─┤
  C7  (admin dashboard pages)            ─┤
  C8  (login + callback pages)           ─┤
  C9  (marketing + UI primitives + player)─┘

Group D (parallel after C)
  D1  Dockerfile
  D2  docker-compose(.yml + .jarch.yml)
  D3  ansible role
  D4  README
  D5  .env.example

Group E (sequential after D)
  E1 unit tests (vitest)
  E2 playwright integration spec
  E3 final polish (CI workflows, scripts/*)
```

Rules:
- A is strict chain (each consumes outputs of the previous).
- B tasks MUST NOT import from each other unless listed in deps; they consume only A outputs + `src/types/*` + env.
- C tasks MUST import from B only, never re-implement B helpers.
- D is config-only; it MUST NOT edit `src/**`.
- E MAY reach into any file for tests but MUST NOT change production behavior.

---

## §C Task list

### Group A — Foundation (sequential)

#### A1 — Repo scaffolding + git hygiene
- **Tier:** haiku
- **Files created:**
  - `/home/joshpointer/developer/airplex/.gitignore`
  - `/home/joshpointer/developer/airplex/.dockerignore`
  - `/home/joshpointer/developer/airplex/LICENSE`                (MIT)
  - `/home/joshpointer/developer/airplex/README.md`              (stub only; D4 fills it)
- **Deps:** none
- **Acceptance:** files exist; `.gitignore` includes `node_modules/`, `.next/`, `data/`, `.env`, `.env.local`, `*.db`, `*.db-shm`, `*.db-wal`, `playwright-report/`, `test-results/`, `.DS_Store`. `.dockerignore` is a superset adding `ansible/`, `tests/`, `.github/`, `docs/`.

#### A2 — package.json + lockfile
- **Tier:** sonnet
- **Files:** `/home/joshpointer/developer/airplex/package.json`, `/home/joshpointer/developer/airplex/package-lock.json`
- **Deps:** A1
- **Runtime deps:** `next@^15`, `react@^19`, `react-dom@^19`, `better-sqlite3@^11`, `iron-session@^8`, `openid-client@^5`, `zod@^3`, `nanoid@^5`, `pino@^9`, `hls.js@^1`, `neopointer-ui@0.1.0` (CSS-only).
- **Dev deps:** `typescript@^5`, `@types/node@^22`, `@types/react@^19`, `@types/better-sqlite3`, `eslint@^9`, `@next/eslint-plugin-next`, `prettier@^3`, `vitest@^2`, `@playwright/test@^1`, `tailwindcss@^3`, `postcss`, `autoprefixer`, `tsx`.
- **Scripts:**
  ```json
  {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "node .next/standalone/server.js",
    "typecheck": "tsc --noEmit",
    "lint": "next lint && prettier --check .",
    "test:unit": "vitest run tests/unit",
    "test:integration": "playwright test",
    "gen-secrets": "tsx scripts/gen-secrets.ts"
  }
  ```
- **Acceptance:** `npm install` succeeds; `npm run typecheck` exits 0 on empty source; `package-lock.json` generated.
- **Interface:** fixes the dep set every other task uses.

#### A3 — tsconfig.json + next.config.ts + eslint/prettier
- **Tier:** sonnet
- **Files:** `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `prettier.config.mjs`
- **Deps:** A2
- **tsconfig:** strict, `paths: { "@/*": ["./src/*"] }`, target ES2022, moduleResolution `bundler`, jsx `preserve`, include `src`, `middleware.ts`, `scripts`, `tests`.
- **next.config.ts:** `output: 'standalone'`, `experimental.serverComponentsExternalPackages: ['better-sqlite3']`, `poweredByHeader: false`, security headers via `headers()` for `/s/:path*` and `/dashboard/:path*`.
- **ESLint rule:** `no-restricted-syntax` forbidding raw SQL template literals passed to `.exec`/`.prepare` (SQL-injection guard per spec §8).
- **Acceptance:** `npm run lint` passes on an empty source tree; `npm run typecheck` passes.

#### A4 — Tailwind + neopointer-ui tokens
- **Tier:** sonnet
- **Files:**
  - `tailwind.config.ts`
  - `postcss.config.mjs`
  - `src/app/globals.css` (imports `neopointer-ui/styles.css` exactly once; defines `.glass`, `.btn-primary`, `.btn-ghost`, `.badge`)
- **Deps:** A3
- **Constraint:** NEVER `import 'neopointer-ui'` as JS — package ships no JS. Only `@import 'neopointer-ui/styles.css';` (or `import 'neopointer-ui/styles.css'` in globals.css — Next resolves to a CSS asset).
- **Acceptance:** `globals.css` has exactly one neopointer-ui reference; Tailwind theme extends with `colors.np: { green: 'var(--np-green)', cyan: 'var(--np-cyan)', magenta: 'var(--np-magenta)', bg: 'var(--np-bg)', fg: 'var(--np-fg)', muted: 'var(--np-muted)' }`, `fontFamily.display: ['var(--np-font-display)']`, `fontFamily.mono: ['var(--np-font-body)']`, `borderRadius.sharp: 'var(--np-radius-sharp)'`, `borderRadius.soft: 'var(--np-radius-soft)'`.

#### A5 — Env loader + logger + errors
- **Tier:** opus (zod validation + boot-fail semantics)
- **Files:** `src/lib/env.ts`, `src/lib/logger.ts`, `src/lib/errors.ts`
- **Deps:** A4
- **`env.ts` exports the typed singleton** matching §D table exactly.
- **Validation:** zod. `SESSION_SECRET`, `DEVICE_LOCK_SECRET`, `SHARE_TOKEN_SECRET` minimum 32 decoded bytes. `OIDC_REDIRECT_URI` defaults to `${APP_URL}/api/auth/callback` and MUST start with `APP_URL`. `OIDC_ADMIN_GROUPS` parsed as comma-separated array.
- **`logger.ts`:** pino singleton honoring `env.LOG_LEVEL`; redact list includes `PLEX_TOKEN`, `authorization`, `cookie`, `set-cookie`, `x-plex-token`.
- **Acceptance:** importing `env` with missing required throws an aggregated readable error; `NODE_ENV=test` allowed.

#### A6 — App layout + health route
- **Tier:** sonnet
- **Files:**
  - `src/app/layout.tsx` (imports `./globals.css`; `<html lang="en">`, `<body>` np bg/fg classes)
  - `src/app/api/health/route.ts` — `GET → { status: 'ok', version: process.env.npm_package_version, ts: Date.now() }`
- **Deps:** A5
- **Acceptance:** `npm run build` completes; `curl localhost:3000/api/health` returns 200 with the shape above.

---

### Group B — Modules (parallel after A6)

#### B1 — DB module (sqlite, migrations, queries)
- **Tier:** opus (migrations + WAL + transactional upserts)
- **Files:**
  - `src/db/client.ts`
  - `src/db/migrate.ts`
  - `src/db/migrations/0001_init.sql`
  - `src/db/migrations/0002_share_events.sql`
  - `src/db/queries/shares.ts`
  - `src/db/queries/events.ts`
  - `src/types/share.d.ts`  ← owner of §A.1
- **Deps:** A6
- **Contract:**
  - `client.ts` exports `getDb(): Database` (singleton), sets `PRAGMA journal_mode=WAL; foreign_keys=ON; synchronous=NORMAL`. Path from `env.DATABASE_URL` (`file:/data/airplex.db` → `/data/airplex.db`).
  - `migrate.ts` exports `runMigrations(): void`; creates `_migrations` table; applies SQL files in sorted order inside a single `BEGIN/COMMIT`.
  - `queries/shares.ts` exports: `insertShare(row: ShareRow): void`, `getShareById(id: string): ShareRow | null`, `getShareByTokenHash(hash: string): ShareRow | null`, `listShares(filter: { status?: 'active'|'expired'|'revoked' }): ShareRow[]`, `claimDevice(id: string, fp: string): boolean`, `resetDevice(id: string): void`, `revokeShare(id: string): void`, `extendShare(id: string, newExpiresAt: number): void`, `incrementPlayCount(id: string): void`, `computeShareStatus(row: ShareRow, now?: number): ShareStatus`.
  - `queries/events.ts` exports: `logEvent(args: { share_id, kind, ip, userAgent, detail? }): void` — hashes ip with daily salt + ua sha256 truncated to 16 hex.
- **Acceptance:** all queries use prepared statements (no template literals into `.exec`/`.prepare`); `claimDevice` is atomic `UPDATE ... WHERE device_fingerprint_hash IS NULL` and returns `this.changes > 0`.

#### B2 — Plex client + types + helpers
- **Tier:** opus (HLS start URL + XML/JSON tolerance)
- **Files:**
  - `src/plex/client.ts`
  - `src/plex/libraries.ts`
  - `src/plex/metadata.ts`
  - `src/plex/transcode.ts`
  - `src/types/plex.d.ts`   ← owner of §A.5
- **Deps:** A6
- **Contract:**
  - `client.ts`: per §A.7. Uses global `fetch`. Injects headers. If `accept:'xml'`, returns raw `Response`; consumer parses.
  - `libraries.ts` exports: `listSections(): Promise<PlexDirectory[]>`, `listItems(sectionId, start, size): Promise<{ items: PlexMetadata[]; total: number }>`.
  - `metadata.ts` exports: `getMetadata(ratingKey): Promise<PlexMetadata>`, `getChildren(ratingKey): Promise<PlexMetadata[]>`.
  - `transcode.ts` exports:
    - `buildStartUrl(params: PlexTranscodeStartParams): string` — `${PLEX_BASE_URL}/video/:/transcode/universal/start.m3u8` with query incl. `path=/library/metadata/{ratingKey}`, `mediaIndex=0`, `protocol=hls`, `directPlay=1`, `directStream=1`, `maxVideoBitrate=20000`, `X-Plex-Client-Identifier`, `session=${linkId}`. Token NOT in query; sent as header by `plexFetch`.
    - `pingSession(linkId: string): Promise<void>`
    - `stopSession(linkId: string): Promise<void>`
- **Acceptance:** unit tests in E1 verify header injection, URL shape, XML fallback.

#### B3 — Share token lib
- **Tier:** opus (crypto correctness)
- **Files:** `src/lib/share-token.ts`
- **Deps:** A6
- **Contract:** §A.2 exactly. No dependency on DB. No exporting of the random bytes or the secret.
- **Acceptance:** round-trip test (create → verify); tamper test; length invariant (token ~ 45 chars).

#### B4 — Device-lock lib
- **Tier:** opus (cookie scoping + iron-session per-link + fp)
- **Files:** `src/lib/device-lock.ts`
- **Deps:** A6
- **Contract:** §A.3 exactly.
  - `cookieNameFor(linkId)`: asserts `linkId` matches `/^[A-Za-z0-9_-]{6,24}$/` else throws.
  - `ironConfigFor(linkId, ttl)` returns: `{ password: env.DEVICE_LOCK_SECRET, cookieName: cookieNameFor(linkId), cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: Math.min(ttl, 30*86400) } }`.
  - `computeDeviceFp`: `sha256(ua + '\n' + acceptLang + '\n' + env.DEVICE_LOCK_SECRET)` hex, truncated to 32 chars.
- **Acceptance:** unit tests per spec §12.1.

#### B5 — HLS rewriter
- **Tier:** opus (manifest parsing + blob crypto)
- **Files:** `src/plex/hls-rewriter.ts`
- **Deps:** A6
- **Contract:** §A.6.
  - Rewrites EVERY non-comment, non-empty line that looks like a segment URI OR a nested playlist URI.
  - Handles both absolute and relative URIs.
  - `#EXT-X-MAP:URI="..."` attribute rewritten.
  - `#EXT-X-KEY:URI="..."` MUST be rewritten (keys proxied like segments).
  - Asserts zero occurrences of `X-Plex-Token` in output.
- **Acceptance:** fixture test (see E1) passes.

#### B6 — OIDC + session + guards + csrf + ratelimit
- **Tier:** opus (OIDC PKCE + iron-session + CSRF)
- **Files:**
  - `src/lib/session.ts`  ← owner of §A.4
  - `src/auth/oidc.ts`
  - `src/auth/guards.ts`
  - `src/lib/csrf.ts`
  - `src/lib/ratelimit.ts`
- **Deps:** A6
- **Contract:**
  - `session.ts`: §A.4. Cookie `airplex_session`, `iron-session` password `env.SESSION_SECRET`, 14-day rolling.
  - `oidc.ts`: §A.8. Uses `openid-client` with discovery (`env.OIDC_ISSUER_URL`). Stores `OidcLoginState` in a short-lived signed cookie `airplex_oidc` (separate iron-session, 5min TTL). PKCE S256.
  - `guards.ts`: `requireAdmin()` — reads session, throws `NextResponse.redirect('/login?returnTo=...')` on miss; if `env.OIDC_ADMIN_GROUPS.length > 0`, require intersection with session.groups. `requireShareAccess(req, linkId)` — loads `ShareRow` by id, checks status via `computeShareStatus`, verifies `airplex_device_<linkId>` cookie iff `device_fingerprint_hash` set, returns row or throws 403.
  - `csrf.ts`: `issueCsrf(session)`, `verifyCsrf(session, header)`.
  - `ratelimit.ts`: in-memory token-bucket `key → { tokens, lastRefillMs }`. Export `rateLimit(key: string, capacity: number, refillPerSec: number): boolean`.
- **Acceptance:** `oidc.handleCallback` rejects on bad `state` / `nonce` / issuer mismatch; csrf rotation unit-tested.

---

### Group C — Routes & pages (parallel after B)

All Group C tasks: "no DB access outside `src/db/queries/*`", "no Plex access outside `src/plex/*`", "no crypto outside `src/lib/*`".

#### C1 — Middleware
- **Tier:** opus (route-gating policy)
- **Files:** `/home/joshpointer/developer/airplex/middleware.ts`
- **Deps:** B6
- **Rules:**
  - `/dashboard/:path*` and `/api/admin/:path*` → if no `airplex_session` cookie present, redirect to `/login?returnTo=<encoded>`.
  - `/api/hls/:path*` → rate-limit by IP (60/min). Token/device checks happen in route handlers (need DB — edge can't).
  - `/s/:path*` → rate-limit 30/min/IP; set headers `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`.
  - `/dashboard/:path*` → CSP `frame-ancestors 'none'`.
- **Matcher:** exclude `_next/static`, `_next/image`, `favicon.svg`, `og.png`, `api/health`.
- **Acceptance:** integration-testable via fetches in E2.

#### C2 — Admin API: libraries
- **Tier:** sonnet
- **Files:** `src/app/api/admin/libraries/route.ts`, `src/app/api/admin/libraries/[sectionId]/items/route.ts`
- **Deps:** B2, B6
- **Contract:** both call `requireAdmin()` first. GET-only. Pass through `start`/`size` query.
- **Acceptance:** 401/redirect when unauthenticated; returns JSON from plex helpers.

#### C3 — Admin API: items
- **Tier:** sonnet
- **Files:** `src/app/api/admin/items/[ratingKey]/route.ts`, `src/app/api/admin/items/[ratingKey]/children/route.ts`
- **Deps:** B2, B6
- **Acceptance:** parity with C2.

#### C4 — Admin API: shares CRUD
- **Tier:** opus (token issue + event logging + PATCH actions)
- **Files:** `src/app/api/admin/shares/route.ts`, `src/app/api/admin/shares/[id]/route.ts`
- **Deps:** B1, B2, B3, B6
- **Contract:**
  - `POST /api/admin/shares` body: `{ ratingKey, title, mediaType, recipient_label, recipient_note?, ttl_hours?, max_plays? }`. Validates ttl ≤ `SHARE_MAX_TTL_HOURS`, defaults to `SHARE_DEFAULT_TTL_HOURS`. Generates id via `nanoid(12)`, token via `createShareToken()`, inserts row, logs `created`. Response: `{ id, token, shareUrl: "${APP_URL}/s/${token}" }`.
  - `GET /api/admin/shares` — list with optional `?status=active|expired|revoked`.
  - `GET /api/admin/shares/[id]` — detail + recent events (limit 50).
  - `PATCH /api/admin/shares/[id]` body: `{ action: 'revoke' | 'reset_device' | 'extend', ttl_hours? }`.
  - `DELETE /api/admin/shares/[id]` — hard delete (cascades events).
  - Every mutating route verifies CSRF header `x-airplex-csrf` === `session.csrf`.
- **Acceptance:** `POST` returns token only once (never retrievable again); subsequent `GET` omits token.

#### C5 — Share pages (token, claimed, expired)
- **Tier:** opus (device-lock state machine on first render)
- **Files:**
  - `src/app/s/[token]/page.tsx`
  - `src/app/s/[token]/claimed/page.tsx`
  - `src/app/s/[token]/expired/page.tsx`
- **Deps:** B1, B3, B4
- **Contract:** Server component. Flow:
  1. `verifyShareTokenSignature`; if bad → 404.
  2. `hashShareToken` → `getShareByTokenHash`. If null → 404.
  3. `computeShareStatus`: expired/revoked/exhausted → render `/expired` variant.
  4. Read headers (`user-agent`, `accept-language`). Compute `device_fp`.
  5. If `device_fingerprint_hash` null: `claimDevice(id, fp)` — atomic. If succeeded, set iron-session cookie `airplex_device_<id>`, log `claimed`, render player.
  6. If claim failed (raced) OR fp present: check iron cookie matches. Match → render player; mismatch → log `rejected_device`, render `/claimed`.
  7. Player receives `{ linkId, title, hlsUrl: '/api/hls/<linkId>/index.m3u8' }` — NEVER the token.
- **Meta:** `<meta name="referrer" content="no-referrer">` on every variant.
- **Acceptance:** Playwright test in E2 verifies claim + second-device rejection.

#### C6 — HLS proxy routes
- **Tier:** opus (segment streaming, ping, stop, encrypted blob roundtrip)
- **Files:**
  - `src/app/api/hls/[link_id]/index.m3u8/route.ts`
  - `src/app/api/hls/[link_id]/seg/[...path]/route.ts`
  - `src/app/api/hls/[link_id]/ping/route.ts`
- **Deps:** B1, B2, B4, B5, B6
- **Contract:**
  - All three call `requireShareAccess(req, linkId)` first.
  - `index.m3u8`: fetch Plex `start.m3u8` via `buildStartUrl` → `rewriteManifest` → return with `Content-Type: application/vnd.apple.mpegurl`, `Cache-Control: private, max-age=1`. On first fetch per session increment play count + log `play`.
  - `seg/[...path]`: `decodeSegmentBlob` → `plexFetch({ path, stream: true })` → stream body back. Preserve `Content-Type` and `Content-Length`. No buffering.
  - `ping`: call `pingSession(linkId)`; return `{ ok: true }`.
- **Acceptance:** manifest output contains zero `X-Plex-Token`; every URI is `/api/hls/<id>/seg/...`.

#### C7 — Admin dashboard pages + components
- **Tier:** sonnet
- **Files:**
  - `src/app/dashboard/layout.tsx` (calls `requireAdmin()` server-side; sidebar shell)
  - `src/app/dashboard/page.tsx`
  - `src/app/dashboard/shares/page.tsx`
  - `src/app/dashboard/shares/new/page.tsx`
  - `src/app/dashboard/shares/[id]/page.tsx`
  - `src/components/dashboard/ShareList.tsx`
  - `src/components/dashboard/ShareCard.tsx`
  - `src/components/dashboard/NewShareForm.tsx`
  - `src/components/dashboard/LibraryPicker.tsx`
- **Deps:** C4, C9
- **Contract:** uses `fetch('/api/admin/...', { headers: { 'x-airplex-csrf': session.csrf } })`. New-share flow: pick library → paginate items → pick item → fill recipient label → submit. Post-create toast with copy-link button (token only shown here, once).
- **Acceptance:** `npm run build` succeeds; all pages render under auth gate.

#### C8 — Login + auth callback
- **Tier:** opus (OIDC wiring)
- **Files:**
  - `src/app/login/page.tsx`
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/callback/route.ts`
  - `src/app/api/auth/logout/route.ts`
- **Deps:** B6
- **Contract:**
  - `/api/auth/login` → `buildAuthorizationUrl(returnTo)` → set `airplex_oidc` cookie with state → 302 to IdP.
  - `/api/auth/callback` → consume cookie → `handleCallback(searchParams, state)` → mint session, issue `csrf`, redirect to `returnTo || /dashboard`.
  - `/api/auth/logout` → destroy session → redirect `/`.
- **Acceptance:** happy-path covered by E2.

#### C9 — UI primitives + marketing + player
- **Tier:** sonnet
- **Files:**
  - `src/app/page.tsx` (marketing hero)
  - `src/components/marketing/Hero.tsx`
  - `src/components/ui/Button.tsx`
  - `src/components/ui/Card.tsx`
  - `src/components/ui/GlassPanel.tsx`
  - `src/components/ui/Input.tsx`
  - `src/components/ui/Select.tsx`
  - `src/components/ui/Badge.tsx`
  - `src/components/ui/Table.tsx`
  - `src/components/player/VideoPlayer.tsx`
  - `src/components/player/AirplayHint.tsx`
- **Deps:** A4
- **Constraint:** UI primitives use `var(--np-*)` tokens exclusively. No external component libs. `VideoPlayer` uses native `<video controls playsInline>` with `src={hlsUrl}`; attaches `hls.js` only if `!video.canPlayType('application/vnd.apple.mpegurl')`. Pings `/api/hls/<linkId>/ping` every 30s while playing.
- **Acceptance:** props typed; `npm run typecheck` passes.

---

### Group D — Deployment config (parallel after C)

#### D1 — Dockerfile
- **Tier:** sonnet
- **File:** `/home/joshpointer/developer/airplex/Dockerfile`
- **Deps:** C1-C9 (so `next build` works)
- **Shape:** multistage per spec §10.3. Stage 1 `node:22-alpine` + `apk add python3 make g++` for `better-sqlite3`; `npm ci`; `next build`. Stage 2 `node:22-alpine` + `apk add --no-cache su-exec`; copy `.next/standalone`, `.next/static`, `public`; entrypoint shim chowns `/data` if root-writable then drops to `node`; `EXPOSE 3000`; `CMD ["node","server.js"]`.
- **Acceptance:** `docker build .` succeeds locally.

#### D2 — docker-compose
- **Tier:** haiku
- **Files:** `docker-compose.yml`, `docker-compose.jarch.yml`
- **Deps:** D1
- **Acceptance:** matches spec §10.3; `jarch` override sets `networks: { default: { name: jarch-public, external: true } }` + Traefik labels.

#### D3 — Ansible role
- **Tier:** sonnet
- **Files:** exactly the tree in spec §10.2 under `/home/joshpointer/developer/airplex/ansible/`.
- **Deps:** D2
- **Preflight (`00-preflight.yml`):** refuse NFS mount on data dir (`stat -f -c %T` must not be `nfs`/`nfs4`).
- **Variables:** `airplex_image`, `airplex_data_dir` (default `/opt/airplex/data`), `airplex_env_source` (`sops` | `vars`), `airplex_docker_network` (default `airplex_default`).
- **Acceptance:** `ansible-playbook ansible/site.yml --syntax-check` passes.

#### D4 — README + docs
- **Tier:** sonnet
- **File:** `/home/joshpointer/developer/airplex/README.md` (final, replacing A1 stub)
- **Deps:** D1, D2, D3
- **Sections:** tl;dr, features, quickstart (Coolify), quickstart (Ansible), env var table (source from spec §9), OIDC setup (Authentik), security notes, development, testing, license.
- **Acceptance:** renders on GitHub without broken anchors.

#### D5 — .env.example
- **Tier:** haiku
- **Files:** `.env.example`
- **Deps:** A5 (env schema)
- **Acceptance:** every var from §D below appears with safe placeholder; 1:1 with env schema (no extras, no omissions).

---

### Group E — Tests + polish (sequential after D)

#### E1 — Unit tests (Vitest)
- **Tier:** sonnet
- **Files:**
  - `tests/unit/share-token.spec.ts`
  - `tests/unit/device-lock.spec.ts`
  - `tests/unit/hls-rewriter.spec.ts`
  - `tests/unit/plex-client.spec.ts`
  - `tests/unit/env.spec.ts`
  - `tests/unit/db-queries.spec.ts`
  - `tests/fixtures/plex-sections.xml`
  - `tests/fixtures/plex-library-all.xml`
  - `tests/fixtures/plex-start-m3u8.m3u8`
  - `vitest.config.ts`
- **Deps:** all of B
- **Acceptance:** `npm run test:unit` green; coverage > 80% on `src/lib/*` + `src/plex/hls-rewriter.ts` + `src/db/queries/*`.

#### E2 — Playwright integration spec
- **Tier:** opus (stub OIDC + stub Plex in-process)
- **Files:** `tests/integration/admin-create-share.spec.ts`, `tests/integration/stubs/oidc.ts`, `tests/integration/stubs/plex.ts`, `playwright.config.ts`
- **Deps:** E1, all C routes
- **Acceptance:** spec per §12.2 passes headless.

#### E3 — Final polish
- **Tier:** sonnet
- **Files:**
  - `.github/workflows/ci.yml`
  - `.github/workflows/publish.yml`
  - `scripts/gen-secrets.ts`
  - `scripts/smoke.ts`
- **Deps:** E2
- **Acceptance:** CI green on local Act run or documented; `npx tsx scripts/gen-secrets.ts` prints three 64-hex secrets.

---

## §D Environment contract

Every var below appears in `.env.example` (D5), is validated by `src/lib/env.ts` (A5), and referenced only via `env.*` (never `process.env.*` outside `env.ts`).

| Var | Default | Required | Produced by | Consumed by |
|---|---|---|---|---|
| `APP_URL` | — | yes | operator | A5, B6, C4, C8 |
| `DATABASE_URL` | `file:/data/airplex.db` | yes | operator | A5, B1 |
| `PLEX_BASE_URL` | — | yes | operator | A5, B2 |
| `PLEX_TOKEN` | — | yes | operator | A5, B2 (header-only) |
| `PLEX_CLIENT_IDENTIFIER` | — | yes | operator | A5, B2 |
| `SESSION_SECRET` | — | yes | `scripts/gen-secrets.ts` | A5, B6 |
| `DEVICE_LOCK_SECRET` | — | yes | `scripts/gen-secrets.ts` | A5, B4, B5 |
| `SHARE_TOKEN_SECRET` | — | yes | `scripts/gen-secrets.ts` | A5, B3 |
| `OIDC_ISSUER_URL` | — | yes | operator | A5, B6 |
| `OIDC_CLIENT_ID` | — | yes | operator | A5, B6 |
| `OIDC_CLIENT_SECRET` | — | yes | operator | A5, B6 |
| `OIDC_ADMIN_GROUPS` | `""` | no | operator | A5, B6 |
| `OIDC_REDIRECT_URI` | `${APP_URL}/api/auth/callback` | no | derived in A5 | B6 |
| `OIDC_GROUPS_CLAIM` | `groups` | no | operator | A5, B6 |
| `SHARE_DEFAULT_TTL_HOURS` | `48` | no | — | A5, C4 |
| `SHARE_MAX_TTL_HOURS` | `168` | no | — | A5, C4 |
| `NODE_ENV` | — | yes | runtime | A5 |
| `LOG_LEVEL` | `info` | no | operator | A5, logger |
| `TRUST_PROXY` | `false` | no | operator | A5, C1 |

`DAILY_SALT` is derived in-memory (B1 events logger) — not configured.
NEVER prefix any var with `NEXT_PUBLIC_` — all server-only.

---

## §E Commands (Phase 3 QA)

Run in order; stop on first failure.

```bash
cd /home/joshpointer/developer/airplex
npm ci                       # expected: "added N packages"
npm run typecheck            # expected: silent exit 0
npm run lint                 # expected: prettier + eslint 0 errors
npm run build                # expected: next build prints route table; ends with "Standalone: 1"
npm run test:unit            # expected: all tests green, >= 6 suites
npx playwright install --with-deps chromium   # first run only
npm run test:integration     # expected: 1 passed (1 total)
docker build -t airplex:qa . # expected: "=> naming to docker.io/library/airplex:qa"
ansible-playbook ansible/site.yml --syntax-check -i ansible/inventory.example.ini
```

Happy-path smoke (after `docker run` with a populated `.env`):

```bash
curl -sf http://localhost:3000/api/health   # expected: {"status":"ok",...}
```

Regression detectors:
- `grep -R "X-Plex-Token" .next/standalone/` MUST return zero matches.
- `grep -R "NEXT_PUBLIC_" src/` MUST return zero matches.
- `grep -R "process.env" src/` MUST only match `src/lib/env.ts`.

---

## §F Critical correctness notes

Failure modes most likely when executors run in parallel, with concrete mitigations.

1. **Drift from shared interfaces.** Two tasks redefine `ShareRow` with slightly different nullable fields → coercion bugs.
   *Mitigation:* §A is the single source of truth. Every Group C task MUST `import type { ShareRow } from '@/types/share'`. Reviewer greps for `interface ShareRow` occurrences — must be exactly 1.

2. **Token/secret generation divergence.** An executor implements share-token generation inside an API route instead of importing `src/lib/share-token.ts`.
   *Mitigation:* B3 owns generation. C4 MUST import `createShareToken`. Reviewer greps `createHmac` outside `src/lib/*` — MUST be 0. Same for `crypto.randomBytes(16)` — allowed only in B3.

3. **neopointer-ui misuse.** Executor writes `import { Button } from 'neopointer-ui'` — the package ships no JS and build fails, OR imports styles.css in multiple places causing CSS specificity surprises.
   *Mitigation:* The *only* allowed reference is `import 'neopointer-ui/styles.css'` in `src/app/globals.css` (A4). No other file may mention `neopointer-ui`. CI grep: `grep -R "neopointer-ui" src/` MUST have exactly one hit (globals.css) + one in package.json.

4. **SQLite file permissions in Docker.** Dockerfile runs as `USER node` (uid 1000), but bind-mounted `/data` is owned by root on host → SQLite open fails.
   *Mitigation:* D1 includes an entrypoint shim that chowns `/data` if writable-as-root, then `exec su-exec node node server.js`. D3 Ansible role creates `/opt/airplex/data` with `owner: 1000, group: 1000, mode: '0755'`. Document in README.

5. **Plex token leaking via Referer or client HTML.** An executor passes the token to a client component by mistake, or leaves a `<meta>` referrer policy off on share pages.
   *Mitigation:* B2 is the ONLY module that reads `env.PLEX_TOKEN`. Reviewer greps for `PLEX_TOKEN` — must only appear in `src/lib/env.ts` and `src/plex/client.ts`. C5 and C6 MUST set `Referrer-Policy: no-referrer` at the response level AND `<meta name="referrer" content="no-referrer">` in the HTML head.

6. **Device-lock race (bonus).** Two simultaneous GETs to `/s/<token>` could both see `device_fingerprint_hash = NULL` and both attempt to claim.
   *Mitigation:* B1's `claimDevice` is `UPDATE ... WHERE device_fingerprint_hash IS NULL` and reports rows-changed. Only the winner sets the cookie; the loser falls through to mismatch logic. C5 MUST follow that branch exactly.

---

## §G Out-of-scope / deferred (NOT implement in Phase 2)

Per spec §2 and §13 — executors that notice these during implementation MUST NOT add them; instead leave a `// TODO(v1.1):` comment where relevant.

- **Postgres driver / multi-admin.** SQLite only. `DATABASE_URL` schema validation in A5 accepts only `file:*` URIs.
- **Chromecast / Google Cast SDK.** No `cast_sender.js`, no receiver app, no Cast button.
- **DRM content playback.** If Plex returns a DRM-locked stream, surface a generic "unplayable" error — do NOT attempt Widevine/FairPlay.
- **Subtitle / audio track picker.** Native `<video>` default only.
- **Downloads / offline / save-to-device.** No `<a download>`, no service worker caching segments.
- **Search / browse for recipients.** The share page shows one item, no listing.
- **Per-user admin analytics, Prometheus metrics, OpenTelemetry.** Pino logs only.
- **Multi-Plex-server support.** One `PLEX_BASE_URL` globally.
- **RP-initiated OIDC logout.** Local logout only. `/api/auth/logout` does not hit `end_session_endpoint`.
- **Horizontal scaling.** In-memory rate limiter is single-instance; documented, not fixed.
- **Visual regression / load testing.** Explicitly out per spec §12.3.
- **Internal `@airplex/ui` shared package.** Components live in `src/components/ui/` only (spec §13.10 decision).

---

*End of plan.*
