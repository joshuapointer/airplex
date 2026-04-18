# airplex — Technical Specification

> Status: **DRAFT v0** — source of truth for the initial build. Opinionated, decisive. Planner will decompose this into executor tasks.

A Plex share-link service. Admin creates a time-boxed link bound to a named recipient. Recipient opens link on their phone, hits play, and AirPlays to a TV. No app. No login. No Chromecast.

---

## 1. Overview and goals

airplex is a single-tenant web service that lets a Plex owner send *disposable, device-locked, recipient-tagged* streaming links to friends and family. The recipient experience is: tap link → page loads → press play → AirPlay button appears natively in iOS Safari → cast to their TV. That's it.

### Primary goals

1. **Zero-setup for recipients.** No app install, no account, no Plex login. A URL and a play button.
2. **Admin ergonomics.** A dashboard to mint, label, and revoke links. See play counts, expiry, device-lock status.
3. **Security by default.** Unguessable tokens; first-device lock; Plex token never reaches the browser; every HLS segment proxied through airplex.
4. **AirPlay-first.** iOS Safari plays HLS natively and surfaces the AirPlay picker for free. We do not ship the Cast SDK. We do not ship a React Native app. We do not reinvent receivers.
5. **Portable deployment.** Ship as a standalone OSS repo deployable via Coolify *or* Ansible. No coupling to the author's personal `jarch-bootstrap` infra.
6. **Neobrutalist UI.** All styling flows through `neopointer-ui` CSS tokens — green `#00FF66`, cyan `#00F0FF`, magenta `#FF00E5`, black bg, Antonio display, JetBrains Mono body, 2–6px corners, glass panels.

### Success criteria

- Admin can create a share in < 30s from dashboard.
- Recipient can open + play a share in < 10s on an iPhone over LTE.
- No path in the app leaks `X-Plex-Token` to any browser network tab.
- A second device attempting a claimed link gets a friendly rejection screen, not an error.
- Repo clones, `.env.example` fills in, `docker compose up -d` produces a working instance.

---

## 2. Non-goals

- **Chromecast / Google Cast.** AirPlay only. Recipients on Android can still stream the video in-browser, but no cast button.
- **DRM-protected content.** Widevine/FairPlay/PlayReady are out of scope. If Plex reports a file as DRM-locked, we error.
- **Downloads / offline.** Streaming only. No "save to device."
- **Multi-user admin.** One admin (via OIDC). No RBAC, no invites, no teams on the admin side. The *share side* is multi-friend; the *admin side* is single-seat.
- **Native apps.** No iOS/Android app, no Electron shell. Web only.
- **Transcoding policy tuning.** We ask Plex for HLS via `/video/:/transcode/universal/start.m3u8` with `directPlay=1&directStream=1` and let Plex decide. No bitrate picker, no subtitle picker (MVP).
- **Search / browse for the recipient.** Recipients get exactly one `ratingKey` per link — no library browsing on the share side.
- **Analytics beyond play count.** No viewer tracking, no heatmaps, no watch position sync.
- **Multi-Plex-server fanout.** One Plex backend per airplex instance.

---

## 3. Architecture

```
                                     +---------------------------------+
                                     |         Plex VPS (yours)        |
                                     |   Public HTTPS, X-Plex-Token    |
                                     +----------------▲----------------+
                                                      |  (server-side only,
                                                      |   token in header,
                                                      |   never to browser)
                                                      |
+----------------+     OIDC login      +--------------+--------------+
|  Admin browser | <-----------------> |                             |
|  (desktop)     |                     |                             |
|  /dashboard    |  session cookie:    |       airplex (Next.js)     |
|  /shares/new   |  airplex_session    |                             |
+----------------+                     |   app router + API routes   |
                                       |   better-sqlite3 (file db)  |
                                       |   iron-session cookies      |
+----------------+                     |   openid-client (Authentik) |
|  Recipient     |     signed URL      |   HLS proxy route           |
|  iPhone Safari | ------------------> |                             |
|  /s/<token>    |  device-lock cookie |                             |
|  <video> HLS   |  airplex_device_<id>|                             |
+--------+-------+                     +--------------+--------------+
         |                                            |
         |                                            |
         |   GET /api/hls/<link_id>/index.m3u8        |
         |   GET /api/hls/<link_id>/seg/<path>        |
         |                                            |
         |        (segments proxied; Plex URLs        |
         |         rewritten so token never leaks)    |
         |                                            |
         v                                            |
  AirPlay -> TV                                       |
                                                      v
                              +--------------------------------------+
                              |  Authentik (admin's IdP — any OIDC)  |
                              +--------------------------------------+
```

Two distinct trust zones inside the app:

- **Admin zone** — routes under `/dashboard`, `/api/admin/*`. Requires a valid `airplex_session` cookie established via OIDC login against Authentik.
- **Share zone** — routes `/s/<token>`, `/api/hls/<link_id>/*`. Requires: (a) token valid + unexpired + unrevoked, AND (b) a matching `airplex_device_<link_id>` cookie OR no cookie exists yet (in which case this request claims the link).

---

## 4. Data model

SQLite via `better-sqlite3`. One file at `/opt/airplex/data/airplex.db` (bind-mounted). WAL mode enabled.

No `users` table — admin identity is whatever Authentik returns in the `sub` claim; we simply gate on "has a valid session."

### 4.1 `shares`

```sql
CREATE TABLE shares (
  id                      TEXT PRIMARY KEY,                -- nanoid(12), internal link_id
  token_hash              TEXT NOT NULL UNIQUE,            -- sha256(token) — raw token never stored
  plex_rating_key         TEXT NOT NULL,                   -- Plex library metadata ratingKey
  title                   TEXT NOT NULL,                   -- denormalized title snapshot at creation
  plex_media_type         TEXT NOT NULL,                   -- 'movie' | 'episode' (no shows/seasons as a whole)
  recipient_label         TEXT NOT NULL,                   -- e.g. "Mom", "Alex - birthday"
  recipient_note          TEXT,                            -- free-text admin-only note
  created_at              INTEGER NOT NULL,                -- unix seconds
  expires_at              INTEGER NOT NULL,                -- unix seconds; default now + 48h, max now + 7d
  max_plays               INTEGER,                         -- NULL = unlimited
  play_count              INTEGER NOT NULL DEFAULT 0,      -- incremented on first HLS manifest fetch per session
  device_fingerprint_hash TEXT,                            -- hex sha256, set on first-claim
  device_locked_at        INTEGER,                         -- unix seconds, set on first-claim
  revoked_at              INTEGER,                         -- unix seconds; NULL = active
  created_by_sub          TEXT NOT NULL                    -- OIDC sub of admin who created
);

CREATE INDEX idx_shares_expires ON shares(expires_at);
CREATE INDEX idx_shares_token_hash ON shares(token_hash);
```

### 4.2 `share_events`

Lightweight audit trail — used to drive the dashboard's "recent activity" column and to debug device-lock disputes.

```sql
CREATE TABLE share_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id    TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  at          INTEGER NOT NULL,
  kind        TEXT NOT NULL,      -- 'created'|'claimed'|'play'|'rejected_device'|'expired'|'revoked'|'reset'
  ip_hash     TEXT,               -- sha256(ip + DAILY_SALT) — not raw IP
  ua_hash     TEXT,               -- sha256(user-agent) truncated
  detail      TEXT                -- json blob, small
);

CREATE INDEX idx_events_share ON share_events(share_id, at DESC);
```

### 4.3 `sessions` (optional)

We use `iron-session` (stateless, encrypted cookie), so no server-side session table is required for admin sessions. We document Postgres + `next-auth`/`@auth/drizzle-adapter` as an upgrade path for multi-admin later.

### 4.4 Migrations

Hand-written SQL in `src/db/migrations/NNNN_name.sql`. Applied at boot by a simple runner that tracks applied migrations in a `_migrations` table. No ORM. Query helpers in `src/db/queries/*.ts`.

---

## 5. URL and route map

Next.js 15 app router. `src/app/` layout.

### Public / share routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | public | Marketing / landing. Shows "airplex" wordmark + one line. No share browsing. |
| `/s/[token]` | share-token | Recipient player page. First-hit sets device-lock cookie. Subsequent hits verified. |
| `/s/[token]/claimed` | share-token | Rejection page shown when device-lock mismatches. |
| `/s/[token]/expired` | public | Shown for expired / revoked / exhausted tokens. |
| `/api/hls/[link_id]/index.m3u8` | share-token + device-lock | Returns rewritten HLS manifest. |
| `/api/hls/[link_id]/seg/[...path]` | share-token + device-lock | Proxies transcoded segments from Plex. |
| `/api/hls/[link_id]/ping` | share-token + device-lock | Calls Plex `/video/:/transcode/universal/ping` with `X-Plex-Token` to keep the session alive. |

### Admin auth routes

| Path | Auth | Purpose |
|---|---|---|
| `/login` | public | "Sign in with Authentik" button. |
| `/api/auth/login` | public | Kicks off OIDC Authorization Code + PKCE. Redirects to IdP. |
| `/api/auth/callback` | OIDC state | Validates code, mints `airplex_session`, redirects to `/dashboard`. |
| `/api/auth/logout` | admin | Clears session + redirects to `/`. |

### Admin routes

| Path | Auth | Purpose |
|---|---|---|
| `/dashboard` | admin | Landing: list of active shares, "New share" button. |
| `/dashboard/shares` | admin | Full list with filters (active / expired / revoked). |
| `/dashboard/shares/new` | admin | Create form: pick library → item → recipient label → TTL + caps. |
| `/dashboard/shares/[id]` | admin | Detail: copy link, revoke, reset device-lock, view events. |
| `/api/admin/libraries` | admin | `GET` — proxies Plex `/library/sections`. |
| `/api/admin/libraries/[sectionId]/items` | admin | `GET` — paginated item list from `/library/sections/{id}/all`. |
| `/api/admin/items/[ratingKey]` | admin | `GET` — detail (`/library/metadata/{ratingKey}`). |
| `/api/admin/items/[ratingKey]/children` | admin | `GET` — seasons/episodes. |
| `/api/admin/shares` | admin | `GET` list / `POST` create. |
| `/api/admin/shares/[id]` | admin | `GET` detail / `PATCH` (revoke, reset_device, extend) / `DELETE`. |

### Route protection

A single `middleware.ts` runs for all non-static paths:

- `/dashboard/*` and `/api/admin/*` → require `airplex_session`; else redirect `/login`.
- `/api/hls/*` → require token + device-lock; else 403 JSON.
- `/s/[token]` → always rendered; page component itself runs the device-lock check and chooses which variant (player / claimed / expired) to render.

---

## 6. Share token format

**Not a JWT.** JWTs are too long for SMS/iMessage link previews and tempt people to ship claims in the payload. We use an **HMAC-signed opaque**.

### 6.1 Structure

```
<base64url(random_16_bytes)>.<base64url(hmac_sha256(SHARE_TOKEN_SECRET, random_16_bytes))[0:16]>
```

- 16 random bytes → 22 base64url chars.
- 16-byte truncated HMAC → 22 base64url chars (we truncate to 16 bytes = 128 bits, still infeasible to forge).
- Dot separator.
- Total: ~45 chars. Fits comfortably in a short URL.

Example: `SxJk2Tw7-vQn9L0Zf_4aXQ.b3kRz8YmQvW2n1-fEoPgQQ`

### 6.2 Fields

The token itself carries **no claims**. All metadata (expiry, link_id, max_plays) lives in the `shares` row keyed by `token_hash = sha256(full_token)`. This means:

- Revocation is immediate (delete/flag the row; no blacklist lookup needed — the row is the source of truth).
- We can rotate `SHARE_TOKEN_SECRET` by re-issuing all active tokens (admin one-click "rotate all active").
- Token length is fixed regardless of payload growth.

### 6.3 Env var

`SHARE_TOKEN_SECRET` — 32+ bytes, base64 or hex. Required. App refuses to boot without it.

### 6.4 Validation flow

1. Receive token from URL.
2. Split on `.`; verify both halves decode.
3. Recompute HMAC over the random half; constant-time compare to provided half. Reject if mismatch.
4. `sha256(full_token)` → look up `shares` row by `token_hash`.
5. Check `expires_at > now`, `revoked_at IS NULL`, `max_plays IS NULL OR play_count < max_plays`.
6. If all pass, the token is valid. Proceed to device-lock check (§7).

---

## 7. Device-lock cookie flow

First browser to open a valid share claims it. Everyone else gets the "already claimed" screen. This is the single most important UX affordance for the admin — they know exactly who got in.

### 7.1 Cookie

- **Name:** `airplex_device_<link_id>` — scoped-by-link so multiple active shares to the same device coexist.
- **Encoding:** `iron-session` encrypted cookie. Payload: `{ link_id, device_fp, issued_at }`.
- **Flags:** `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age = share.expires_at - now` (capped at 30 days absolute).
- **Device fingerprint (`device_fp`):** `sha256( user_agent + accept_language + DEVICE_LOCK_SECRET )` — truncated to 16 bytes hex. Deliberately **not** canvas/webgl fingerprinting; we want "same browser profile on same device" not "forensic identity."

### 7.2 First-open (claim)

```
GET /s/<token>
  |
  v
token valid? ----no---> /s/<token>/expired
  |yes
  v
shares.device_fingerprint_hash IS NULL?
  |yes ---> compute device_fp from req headers
  |         UPDATE shares SET device_fingerprint_hash=device_fp, device_locked_at=now
  |         set airplex_device_<link_id> cookie with iron-session
  |         log share_events (kind='claimed')
  |         render player
  |
  |no
  v
request has airplex_device_<link_id> cookie matching device_fp?
  |yes ---> render player
  |no  ---> log share_events (kind='rejected_device'); render /s/<token>/claimed
```

### 7.3 Admin "reset" flow

`PATCH /api/admin/shares/<id>` with `{ action: "reset_device" }`:

- `UPDATE shares SET device_fingerprint_hash=NULL, device_locked_at=NULL WHERE id=?`
- Logs `share_events (kind='reset')`.
- The next visit (from any device) re-claims. The previously claimed device's cookie is now stale — on its next request, cookie's `device_fp` won't match the (newly-null-then-newly-set) DB value, so *it* gets the claimed screen. This is acceptable and documented.

### 7.4 Why not IP-bind?

Mobile carriers rotate IPs constantly. IP-binding would break the link mid-session. Cookie-bind survives IP changes (LTE → Wi-Fi → tethering) and that is almost always what the admin wants.

---

## 8. Security threats and mitigations

| Threat | Mitigation |
|---|---|
| **Token brute force** | 128 bits of random. 16-byte truncated HMAC verified before DB lookup — attacker cannot even enumerate DB rows without first guessing a valid signature. Rate-limit `/s/*` to 30 req/min per IP via in-process token-bucket. |
| **Replay / sharing the link** | First-device lock (§7). A forwarded link doesn't work for a second device. Admin sees "claimed" status in dashboard immediately. |
| **Token leaking via `Referer`** | `<meta name="referrer" content="no-referrer">` on `/s/*` pages. HLS playlist URLs use `link_id` (internal ID, NOT the token) so even if a proxy logs `Referer`, the token is already stripped from the URL by Next.js since the token lives only on the share page, not on HLS segment URLs. |
| **HLS segment leakage** | All segments go through our proxy. We *never* return a Plex URL to the browser. Manifest is rewritten on the server: every segment URI becomes `/api/hls/<link_id>/seg/<opaque-path>`. The opaque path is an encrypted blob of the original Plex path + params, decrypted server-side. |
| **Plex token exposure** | `PLEX_TOKEN` is server-side env only. Never sent to the client. Not logged. Header-only (`X-Plex-Token` request header) on outgoing requests. |
| **MITM / missing HTTPS** | App refuses to set session or device-lock cookies without `Secure`. Coolify+Traefik/any reverse proxy is assumed to terminate TLS. Document an `X-Forwarded-Proto` trust config. |
| **Clickjacking on player** | `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY` on `/s/*` and `/dashboard/*`. |
| **OIDC code interception** | PKCE on authorization code flow (S256). `state` + `nonce` checked on callback. Redirect URI allowlist exact-match. |
| **Session fixation** | Session cookie rotated on login success (`iron-session` rotates automatically on `session.save()` after a fresh login). |
| **Admin CSRF** | Same-origin + `SameSite=Lax` session cookie + double-submit CSRF token header on all `POST/PATCH/DELETE` under `/api/admin/*`. |
| **SQL injection** | Prepared statements via `better-sqlite3` — no string concat. Enforced by lint rule (`no-restricted-syntax` forbidding `db.exec(...template literals...)`). |
| **Device-lock cookie theft** | Cookies `HttpOnly` + `Secure`. App binds `device_fp` to `UA + Accept-Language`; stealing only the cookie is insufficient if the thief's UA differs. Not perfect — it's a "friendly audit" control, not a DRM boundary. Documented. |
| **Long-lived transcode sessions pinning Plex RAM** | `/api/hls/<id>/ping` is called by the browser every 30s; the server translates to Plex's `/video/:/transcode/universal/ping`. Server-side watchdog kills sessions on client disconnect (EventSource-style heartbeat timeout). |

---

## 9. Configuration

### 9.1 Environment variables

All secrets loaded from env. In production via `/run/secrets/airplex.env` on the Ansible path, or via Coolify's secret UI on the Coolify path. `.env` for dev only.

| Var | Required | Example | Purpose |
|---|---|---|---|
| `APP_URL` | yes | `https://airplex.example.com` | Absolute base URL; used for OIDC `redirect_uri`, absolute share URLs. |
| `DATABASE_URL` | yes | `file:/data/airplex.db` | SQLite file path. URL form for future Postgres compat. |
| `PLEX_BASE_URL` | yes | `https://plex.example.com:32400` | Public Plex endpoint. |
| `PLEX_TOKEN` | yes | `xxxxxxxxxxxxxx` | `X-Plex-Token`. Server-only. |
| `PLEX_CLIENT_IDENTIFIER` | yes | `airplex-prod` | Passed as `X-Plex-Client-Identifier` on every Plex request. Distinct per instance. |
| `SESSION_SECRET` | yes | 64 hex chars | `iron-session` password for `airplex_session`. |
| `DEVICE_LOCK_SECRET` | yes | 64 hex chars | HMAC key + device_fp salt + iron-session password for `airplex_device_*`. |
| `SHARE_TOKEN_SECRET` | yes | 64 hex chars | HMAC key for share tokens. |
| `OIDC_ISSUER_URL` | yes | `https://auth.example.com/application/o/airplex/` | Authentik OIDC issuer (discovery = `<issuer>/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | yes | `airplex` | |
| `OIDC_CLIENT_SECRET` | yes | — | |
| `OIDC_ADMIN_GROUPS` | optional | `airplex-admins` | Comma-separated. If set, `groups` claim must include at least one. Otherwise any successful OIDC login is admitted (single-admin deployments). |
| `OIDC_REDIRECT_URI` | derived | `${APP_URL}/api/auth/callback` | Explicit override allowed. |
| `SHARE_DEFAULT_TTL_HOURS` | optional | `48` | Default expiry. |
| `SHARE_MAX_TTL_HOURS` | optional | `168` | Hard cap (7d). |
| `DAILY_SALT` | derived | — | Rotated daily in-memory for IP hashing in `share_events`. Not configured. |
| `NODE_ENV` | yes | `production` | |
| `LOG_LEVEL` | optional | `info` | `trace`/`debug`/`info`/`warn`/`error`. |
| `TRUST_PROXY` | optional | `true` | Honor `X-Forwarded-For`/`-Proto`. Required behind Traefik. |

### 9.2 `.env.example`

Ship one. Every var above, with safe placeholders, no real secrets.

### 9.3 OIDC redirect URL

Register in Authentik **exactly**: `https://<APP_URL>/api/auth/callback`. No trailing slash. The app fails fast at boot if `OIDC_REDIRECT_URI` is outside `APP_URL`.

---

## 10. Deployment

Two fully supported paths. Both produce the same artifact — a container image running the Next.js server with SQLite bind-mounted and env passed in.

### 10.1 Coolify path

1. In Coolify, create a new application → **Dockerfile** source → point at the repo.
2. Set env vars in the Coolify secret UI (all of §9.1).
3. Attach a persistent volume at `/data` for the SQLite file.
4. Set the domain; Coolify/Traefik handles TLS.
5. Enable GitHub webhook (Coolify's built-in) for redeploy-on-push.

Optionally, connect airplex's container to the `jarch-public` Docker network so it routes via an existing Traefik, not Coolify's managed one. Documented in README under "Advanced: sharing a Traefik with jarch-bootstrap."

### 10.2 Ansible path

A self-contained role inside the repo at `ansible/`. Installs to `/opt/airplex/`. Works against any Debian/Ubuntu/Arch host with Docker installed. No dependency on `jarch-bootstrap`.

**File layout under `ansible/`:**

```
ansible/
  README.md
  site.yml                           # entry playbook: runs role airplex
  inventory.example.ini
  roles/
    airplex/
      defaults/main.yml              # image tag, data dir, network name
      vars/main.yml
      tasks/
        main.yml                     # include preflight, install, service
        00-preflight.yml             # docker present, disk space
        10-install.yml               # /opt/airplex dir, compose file, env file
        20-service.yml               # systemd unit airplex.service or docker compose up -d
      templates/
        docker-compose.yml.j2
        airplex.env.j2               # from Ansible vars OR from /run/secrets/airplex.env if present
        airplex.service.j2           # optional systemd wrapper
      handlers/main.yml
```

**Secrets handling:**

- If `/run/secrets/airplex.env` exists (SOPS pattern, matches jarch-bootstrap), the role symlinks or copies it to `/opt/airplex/.env`.
- Otherwise, the role templates `airplex.env.j2` from Ansible-vault or plain inventory vars.
- Both modes produce the same `/opt/airplex/.env` file read by `docker-compose.yml`.

**Optional jarch integration:**

- A `airplex_docker_network` default of `airplex_default` (standalone).
- Override to `jarch-public` to attach to the shared Traefik; role wires the appropriate Traefik labels.

### 10.3 Docker layout

**`Dockerfile`** — multistage:
1. `node:22-alpine` builder → `npm ci` → `next build`
2. `node:22-alpine` runner → copies `.next/standalone` + `public` + `.next/static`; `USER node`; `CMD ["node", "server.js"]`

**`docker-compose.yml`** (repo root, used by both paths):

```yaml
services:
  airplex:
    image: ghcr.io/<owner>/airplex:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/data
    ports:
      - "3000:3000"   # Coolify/Traefik can override
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
networks:
  default:
    name: airplex_default
```

`docker-compose.jarch.yml` — override file that joins `jarch-public` and adds Traefik labels. Used when deploying alongside jarch.

---

## 11. Repo file layout

```
airplex/
├── README.md
├── LICENSE                              # MIT
├── .env.example
├── .gitignore
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── docker-compose.jarch.yml             # override for jarch-public network
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── prettier.config.mjs
├── middleware.ts                        # Next.js edge middleware for auth gates
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # imports neopointer-ui/styles.css
│   │   ├── globals.css                  # extends np tokens; defines .glass, .btn-primary
│   │   ├── page.tsx                     # marketing "/"
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx               # sidebar shell, session gate
│   │   │   ├── page.tsx                 # active shares
│   │   │   ├── shares/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   ├── s/
│   │   │   ├── [token]/
│   │   │   │   ├── page.tsx             # player
│   │   │   │   ├── claimed/page.tsx
│   │   │   │   └── expired/page.tsx
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── callback/route.ts
│   │       │   └── logout/route.ts
│   │       ├── admin/
│   │       │   ├── libraries/route.ts
│   │       │   ├── libraries/[sectionId]/items/route.ts
│   │       │   ├── items/[ratingKey]/route.ts
│   │       │   ├── items/[ratingKey]/children/route.ts
│   │       │   └── shares/
│   │       │       ├── route.ts
│   │       │       └── [id]/route.ts
│   │       └── hls/
│   │           └── [link_id]/
│   │               ├── index.m3u8/route.ts
│   │               ├── seg/[...path]/route.ts
│   │               └── ping/route.ts
│   │
│   ├── components/
│   │   ├── ui/                          # hand-built using np tokens
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── GlassPanel.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Table.tsx
│   │   ├── dashboard/
│   │   │   ├── ShareList.tsx
│   │   │   ├── ShareCard.tsx
│   │   │   ├── NewShareForm.tsx
│   │   │   └── LibraryPicker.tsx
│   │   ├── player/
│   │   │   ├── VideoPlayer.tsx          # <video src=m3u8>; hls.js fallback
│   │   │   └── AirplayHint.tsx          # subtle "tap the AirPlay icon" tooltip
│   │   └── marketing/
│   │       └── Hero.tsx
│   │
│   ├── lib/
│   │   ├── env.ts                       # zod-validated env loader, throws at boot
│   │   ├── session.ts                   # iron-session admin config
│   │   ├── device-lock.ts               # iron-session per-link config + fp compute
│   │   ├── share-token.ts               # create, verify, hash
│   │   ├── csrf.ts
│   │   ├── ratelimit.ts                 # in-memory token bucket
│   │   ├── logger.ts                    # pino
│   │   └── errors.ts
│   │
│   ├── auth/
│   │   ├── oidc.ts                      # openid-client wrapper, discovery cache
│   │   └── guards.ts                    # requireAdmin(), requireShareAccess()
│   │
│   ├── plex/
│   │   ├── client.ts                    # fetch wrapper; attaches X-Plex-Token header
│   │   ├── libraries.ts
│   │   ├── metadata.ts
│   │   ├── transcode.ts                 # builds start.m3u8 URL; handles ping
│   │   └── hls-rewriter.ts              # parses m3u8, rewrites segment URIs
│   │
│   ├── db/
│   │   ├── client.ts                    # better-sqlite3 singleton; WAL pragma
│   │   ├── migrate.ts                   # runs on boot
│   │   ├── migrations/
│   │   │   ├── 0001_init.sql
│   │   │   └── 0002_share_events.sql
│   │   └── queries/
│   │       ├── shares.ts
│   │       └── events.ts
│   │
│   └── types/
│       ├── plex.d.ts
│       └── share.d.ts
│
├── public/
│   ├── favicon.svg
│   └── og.png
│
├── scripts/
│   ├── gen-secrets.ts                   # prints base64 values for the 3 secrets
│   └── smoke.ts                         # hits /api/health + a mock share flow
│
├── tests/
│   ├── unit/
│   │   ├── share-token.spec.ts
│   │   ├── device-lock.spec.ts
│   │   ├── hls-rewriter.spec.ts
│   │   └── plex-client.spec.ts
│   ├── integration/
│   │   └── admin-create-share.spec.ts   # Playwright
│   └── fixtures/
│       ├── plex-sections.xml
│       ├── plex-library-all.xml
│       └── plex-start-m3u8.m3u8
│
├── ansible/                             # see §10.2
│   └── ...
│
└── .github/
    └── workflows/
        ├── ci.yml                       # lint + typecheck + unit + build
        └── publish.yml                  # on tag: build & push ghcr image
```

---

## 12. Testing strategy

### 12.1 Unit (Vitest)

Fast, no-network, no-DB-required-globally (each test creates an in-memory SQLite).

- **`share-token.spec.ts`** — generate → verify ok; tamper with either half → verify fails; truncated HMAC length-extension resistance check; constant-time comparison confirmed via timing-invariant assertion.
- **`device-lock.spec.ts`** — first claim sets fp; mismatched UA → rejected; admin reset clears fp; claim after reset → new fp set; expired share bypasses lock check (returns "expired" first).
- **`hls-rewriter.spec.ts`** — parses a real Plex `start.m3u8` fixture; every `.ts`/`.m4s` URI rewritten to `/api/hls/<link_id>/seg/<blob>`; `X-Plex-Token` never appears in output; nested playlists handled.
- **`plex-client.spec.ts`** — mocked `fetch`; verifies `X-Plex-Token` header present on every request; verifies `X-Plex-Client-Identifier` present; verifies `Accept: application/json` where applicable; XML fallback parsing.

### 12.2 Integration (Playwright — single spec)

`admin-create-share.spec.ts`:

1. Launch app against a stub OIDC server (`oidc-provider` in-process) and a stub Plex server (Express returning canned XML/JSON fixtures).
2. Log in as admin via OIDC flow.
3. Create a share for `ratingKey=123`.
4. Copy the generated URL.
5. In a fresh browser context: open the share URL → player page renders → `<video>` has an `src` ending in `.m3u8` → the m3u8 URL starts with `/api/hls/`.
6. In a *second* fresh context: open same URL → "claimed" page renders.

### 12.3 Not in scope

- E2E against real Plex — brittle, flakey, user-specific. We stub Plex entirely.
- Load testing — single-tenant app; defer.
- Visual regression — defer until UI stabilizes.

### 12.4 CI

`.github/workflows/ci.yml`:

- `npm ci`
- `npm run lint` (ESLint + Prettier check)
- `npm run typecheck` (`tsc --noEmit`)
- `npm run test:unit`
- `npm run test:integration` (Playwright — headless)
- `npm run build`

Gate merge on green.

---

## 13. Open questions flagged for the planner

1. **Plex session identifier.** Do we reuse one Plex transcode session per share (keyed by `link_id`) or one per browser reload? Leaning per-reload for simplicity; planner should confirm Plex's `/transcode/universal/stop` semantics.
2. **Subtitle support.** MVP = off. Do we expose Plex's sidecar subtitle streams in v1.1, or bake into v1? Opinion: v1.1 — keep MVP focused.
3. **TV episode multi-episode linking.** Can admin create a single link for an entire season that auto-advances? Out of scope for MVP (one ratingKey per link). Flag for v1.1.
4. **Rate-limit store.** In-process token bucket is fine for single-instance. If we ever horizontally scale, we need Redis. Planner should defer but note in README.
5. **SQLite file-locking on NFS.** If the Ansible role runs on a host that bind-mounts `/data` from NFS, SQLite WAL will misbehave. Planner: preflight check in `00-preflight.yml` that refuses NFS mount points.
6. **Authentik group claim name.** Is it `groups` (default) or customized in the user's Authentik? Document how to adjust in `.env` (e.g. `OIDC_GROUPS_CLAIM=groups`).
7. **Logout vs IdP single-logout.** MVP clears local session only — user stays logged into Authentik. Add RP-initiated logout (`end_session_endpoint`) in v1.1.
8. **Analytics for admin.** Beyond play count, do we want per-event timestamps surfaced? `share_events` table exists — planner decides how much to surface in UI for MVP.
9. **HLS manifest TTL.** Plex's manifest is segmented; we re-fetch on each request. Do we cache for 1s to absorb duplicate segment-index requests from the player? Opinion: yes, `Cache-Control: private, max-age=1` on manifest.
10. **`neopointer-ui` component kit.** Since the package is tokens-only, we hand-build Button/Card/etc. Planner: confirm whether a shared `@airplex/ui` internal package is worth it, or keep components co-located in `src/components/ui/` (leaning the latter for MVP simplicity).

---

## Appendix A — Plex endpoint cheatsheet

All requests carry: `X-Plex-Token: <token>`, `X-Plex-Client-Identifier: <PLEX_CLIENT_IDENTIFIER>`, `Accept: application/json` (where supported; some endpoints are XML-only).

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /library/sections` | List libraries | Returns `MediaContainer.Directory[]` with `key`, `title`, `type`. |
| `GET /library/sections/{key}/all` | List items | Supports `X-Plex-Container-Start` / `X-Plex-Container-Size` headers for pagination. |
| `GET /library/metadata/{ratingKey}` | Item detail | Returns `Metadata` with `Media[].Part[].file` + `key`, `duration`. |
| `GET /library/metadata/{ratingKey}/children` | Seasons (for show) or episodes (for season) | |
| `GET /video/:/transcode/universal/start.m3u8` | Begin HLS transcode | Params: `path=/library/metadata/{ratingKey}`, `mediaIndex=0`, `protocol=hls`, `directPlay=1`, `directStream=1`, `maxVideoBitrate=20000`, `X-Plex-Client-Identifier`, `session=<link_id>`. |
| `GET /video/:/transcode/universal/ping` | Keep session alive | Params: `session=<link_id>`, `X-Plex-Token`. Call every 30s from server in response to client ping. |
| `DELETE /video/:/transcode/universal/stop` | Tear down session | Params: `session=<link_id>`. Called on revocation / expiry / client disconnect timeout. |

---

## Appendix B — neopointer-ui usage

Package: `neopointer-ui@0.1.0` (proprietary). Tokens-only.

```ts
// src/app/layout.tsx
import 'neopointer-ui/styles.css';
```

Available tokens (from `src/tokens.css` in the package):

- Colors: `--np-green` (#00FF66), `--np-cyan` (#00F0FF), `--np-magenta` (#FF00E5), `--np-bg` (black), `--np-fg`, `--np-muted`.
- Typography: `--np-font-display` (Antonio), `--np-font-body` (JetBrains Mono), plus size/weight scales `--np-text-xs` .. `--np-text-5xl`.
- Radius: `--np-radius-sharp` (2px), `--np-radius-soft` (6px).
- Glass: `--np-glass-bg`, `--np-glass-border`, `--np-glass-blur`.

Example component sketch:

```tsx
// src/components/ui/Button.tsx
export function Button({ tone = 'green', ...props }) {
  return (
    <button
      className="np-btn"
      style={{
        background: `var(--np-${tone})`,
        color: 'var(--np-bg)',
        fontFamily: 'var(--np-font-display)',
        borderRadius: 'var(--np-radius-sharp)',
        padding: '8px 16px',
      }}
      {...props}
    />
  );
}
```

No `@neopointer-ui/react` exists. Don't import components from it — it has none.

---

## Appendix C — Decisions locked for MVP

| Decision | Choice | Why |
|---|---|---|
| Default TTL | 48h | Covers "send to Mom, she'll watch tonight or tomorrow." |
| Max TTL | 7d | Stops "forever links" that defeat the whole premise. |
| Default `max_plays` | unlimited | Recipient may replay episodes; admin can cap manually. |
| Admin cookie name | `airplex_session` | |
| Device-lock cookie name | `airplex_device_<link_id>` | Per-link scoping avoids collision. |
| Fingerprint inputs | UA + Accept-Language + `DEVICE_LOCK_SECRET` | Survives IP change; resists trivial cookie-theft replay. |
| DB | SQLite (`better-sqlite3`) | Single-instance, file-based, boring-good. |
| Auth | OIDC via `openid-client` against Authentik | Portable to any IdP. |
| Session | `iron-session` (stateless encrypted cookie) | No server session store needed. |
| HLS player | native `<video>` first, `hls.js` fallback | AirPlay in iOS Safari requires native HTML5 video. |
| Cast protocol | AirPlay only | Cast SDK is a swamp; iOS Safari is free. |
| Deployment | Coolify + Ansible, in that order of preference | Coolify is the "clone and go" story; Ansible is the reproducible-infra story. |

---

*End of spec.*
