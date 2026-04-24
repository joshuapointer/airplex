# Development

Day-to-day workflows for working on airplex locally. For the "why" behind any of this, read [`ARCHITECTURE.md`](ARCHITECTURE.md) first.

## Prereqs

- **Node 22 or newer.** Older versions miss runtime APIs the standalone server uses.
- **A reachable Plex Media Server.** Direct URL from your dev box — no relay gymnastics.
- **An OIDC provider.** For quick local work you can use a dummy issuer URL (the env schema only validates URL syntax, not reachability); discovery is lazy and only triggers on `/api/auth/login`.

## First-time setup

```bash
git clone https://github.com/yourname/airplex.git
cd airplex
npm install

cp .env.example .env
npm run gen-secrets   # prints three hex-encoded 32-byte secrets
# paste them into .env as SESSION_SECRET / DEVICE_LOCK_SECRET / SHARE_TOKEN_SECRET
```

Fill in the rest of `.env`:

| Variable                 | Typical dev value                                              |
| ------------------------ | -------------------------------------------------------------- |
| `APP_URL`                | `http://localhost:3000`                                        |
| `DATABASE_URL`           | `file:./data/dev.db`                                           |
| `PLEX_BASE_URL`          | Leave blank — complete setup via `/setup/plex` after logging in |
| `PLEX_TOKEN`             | Leave blank — same reason                                      |
| `PLEX_CLIENT_IDENTIFIER` | `airplex-dev-<your-handle>` (any stable string)                |
| `OIDC_ISSUER_URL`        | Your IdP's issuer URL                                          |
| `OIDC_CLIENT_ID`         | From your IdP                                                  |
| `OIDC_CLIENT_SECRET`     | From your IdP                                                  |
| `NODE_ENV`               | `development`                                                  |

## Running the dev server

```bash
npm run dev
```

That's `next dev -p 3000`. Hot reload works for every file except `middleware.ts` (Next restarts the dev server when middleware changes).

The SQLite file is created on first request. Delete `./data/dev.db` to start from a clean schema.

## Database migrations

Migrations live in `src/db/migrations/` as `NNNN_slug.sql`. They apply in sorted filename order, transactional per run, tracked in the `_migrations` table.

Adding one:

```bash
# Pick the next sequence number
touch src/db/migrations/0006_your_change.sql
# Write the SQL
# Restart the dev server — migrations run on first DB access
```

Two things to watch for:

1. **Schema changes that drop or rename parent tables.** The migration runner sets `foreign_keys = OFF` and `legacy_alter_table = ON` during migrations so child-table FK references don't silently rewrite themselves. If you're doing anything other than `CREATE TABLE` / `CREATE INDEX`, read the notes in `src/db/migrate.ts` before you start.
2. **Rebuild-via-copy, not rename-via-copy.** When changing a table's CHECK constraint or PK, create a new table with the new shape, `INSERT INTO new SELECT * FROM old`, `DROP TABLE old`, `ALTER TABLE new RENAME TO old`. Renaming the _original_ table has previously broken FK references in child tables.

## Testing

### Unit tests

```bash
npm run test:unit                                    # all unit specs
npx vitest run tests/unit/share-token.spec.ts        # a single file
npx vitest run tests/unit -t 'claim'                 # by test name
```

Vitest runs in Node mode against `tests/unit/`. `tests/unit/setup.ts` preloads a dummy env so modules that read `env` at import time don't blow up.

### Integration tests

```bash
npx playwright install chromium   # first time only
npm run test:integration
```

Playwright builds the app, starts the standalone server on `:3100`, and drives the browser. No real OIDC or Plex — `NODE_ENV=test` turns on `/api/test/_seed` which lets the suite insert share rows directly, and the Playwright config passes dummy secrets that satisfy the env schema.

Integration tests cover:

- admin create-share flow (stubbed OIDC)
- recipient claim
- second-device rejection

If you touch the share claim state machine, the HLS manifest rewriter, or the device-lock cookie plumbing, run integration tests before you send a PR.

## Type check and lint

```bash
npm run typecheck
npm run lint
```

The lint step runs `next lint` (ESLint) and `prettier --check`. The ESLint config has a `no-restricted-syntax` rule that errors on template literals passed to `better-sqlite3`'s `.exec()` or `.prepare()` — a SQL injection guardrail. Use parameterized queries.

## Running against a real Plex

The quickest path:

1. Start the dev server.
2. Log in via OIDC (create an Authentik app with redirect `http://localhost:3000/api/auth/callback`, or use whatever IdP you have configured).
3. Visit `/setup/plex`, click **Sign in with Plex**, complete the PIN flow.
4. The app writes the token + server URL to the `settings` table.
5. Create a share from `/dashboard/shares/new`.
6. Open the share URL in a separate browser session.

If your Plex is only reachable over IPv6 ULA (common for LAN-only setups), the setup flow picker may surface unreachable connection URIs. In that case, open the SQLite file and update `plex_server_url` manually to a reachable endpoint from Plex's resources API.

## Debugging HLS playback

Common failure modes and where to start looking:

- **502 from `/api/hls/[link_id]/index.m3u8`** — the Plex transcode start URL was rejected. Plex returns a bare `400 Bad Request` HTML page when X-Plex-* headers are missing. Check `src/plex/transcode.ts` — the transcode start URL needs the full device set (Product, Version, Platform, Device, Device-Name) plus `location=lan`, `copyts=1`, `audioBoost=100`, `fastSeek=1`, `hasMDE=1`.
- **404 on `/api/hls/[link_id]/seg/00001.ts`** — nested m3u8 playlist wasn't rewritten. The seg route has to detect `content-type: application/vnd.apple.mpegurl` and run the response through `rewriteManifest` again. Relative URIs in nested playlists need the containing directory prefixed before rewriting so they resolve to the right Plex path.
- **"Already claimed" on first visit** — link-preview bot (iMessage, Discord, Slack) fetched the URL when it was pasted in a chat and claimed the device before the real recipient. The share page has a UA-based bot bypass regex (`isLinkPreviewBot`) and the claim is gated behind a server action triggered by the "Start streaming" form submit rather than on page render.
- **Segment fails auth decoding** — the share was claimed by one device, reset, then re-claimed. Per-link AES key is deterministic from `DEVICE_LOCK_SECRET + linkId`, so it's stable across claim resets. If you see AES auth-tag mismatches, check for the manifest URL being cached on a stale link id.

`sudo docker logs -f airplex` is usually enough; the structured logger emits the request path + status but never the Plex token or the share token.

## Common workflows

### Add a new share-media type

1. Update the CHECK constraint in a new migration (rebuild-via-copy pattern, see above).
2. Add the new literal to `ShareMediaType` in `src/types/share.d.ts`.
3. Update the zod enum in `src/app/api/admin/shares/route.ts`.
4. Teach the share page's media branching in `src/components/player/ShareWatcher.tsx`.

### Add a new admin route

1. Create `src/app/api/admin/<route>/route.ts`.
2. First line of the handler: `await requireAdmin()`.
3. If it takes a body, `verifyCsrf(session, req.headers.get('x-airplex-csrf'))` before parsing.
4. Parse with zod. Bind prepared statements in `src/db/queries/*.ts` — never inline SQL.

### Add a new recipient API

1. Create `src/app/api/hls/[link_id]/<route>/route.ts` (reuses the `/api/hls/*` rate limit bucket).
2. First line: guard via `requireShareAccess(req, linkId)`.
3. Keep responses minimal — no tokens, no internal IDs beyond `linkId`, no Plex URLs.

## Memory, traces, shared state

The repo has an `.omc/` directory that the Claude Code plugin writes to. It's gitignored — ignore it unless you're debugging something related to the agent harness. Nothing in production touches it.

## Getting unstuck

- Start with `CLAUDE.md` — it's the cheat sheet.
- `ARCHITECTURE.md` has the mental model.
- `spec.md` (if present) has product-level rationale.
- Source comments with `§A.N` or `plan §` markers link to design decisions from the original build plan.
