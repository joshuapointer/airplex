# airplex

Share a Plex stream. Hit play. AirPlay to anything.

---

## What it is

Sharing a Plex library with friends today requires every recipient to create a Plex account,
install the Plex app, and accept a managed-user invitation. That is too much friction for a
one-off movie night with someone who just wants to cast to the TV.

airplex replaces that flow with ephemeral, per-recipient share links. The admin picks a
movie or episode from their Plex library, types the recipient's name, sets a time-to-live,
and copies a one-time URL. The recipient opens that URL in iOS Safari, presses play, and
taps the AirPlay icon — no account, no app install, no OAuth dance. The Plex token never
leaves the server; all HLS segment paths are AES-GCM encrypted so the browser never sees
a credential. After the TTL expires, or after the admin revokes the link, it stops working.

---

## Features

- Ephemeral signed share links with configurable TTL (default 48 h, max 168 h)
- Per-recipient labels and optional notes visible only in the admin dashboard
- First-device cookie lock — a second browser opening the same link is rejected
- Admin dashboard: create, list, revoke, extend, and reset-device on shares
- OIDC SSO for admin login (Authentik, Keycloak, or any PKCE-capable provider)
- HLS proxy: Plex token injected server-side, never sent to the browser
- AES-GCM encrypted segment paths so Plex URLs are opaque to the client
- `Referrer-Policy: no-referrer` on all share pages to prevent URL leakage
- Docker Compose deployment with optional jarch-bootstrap overlay
- Ansible role for fully automated provisioning

---

## Quickstart (Docker Compose)

### 1. Clone

```bash
git clone https://github.com/yourname/airplex.git
cd airplex
```

### 2. Generate secrets

Each of the three secrets must be an independent random value. If `scripts/gen-secrets.ts`
has been published (added in task E3 of the build pipeline), use:

```bash
npx tsx scripts/gen-secrets.ts
```

Otherwise generate them manually — one command per secret:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # DEVICE_LOCK_SECRET
openssl rand -hex 32   # SHARE_TOKEN_SECRET
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in every required value. See the
[Environment variables](#environment-variables) table below for a description of each.

### 4. Start

```bash
docker compose up -d
```

The application listens on port `3000` inside the container. Expose it through a reverse
proxy (Traefik, Caddy, nginx) that terminates TLS; the `APP_URL` variable must use `https://`
in production.

### 5. Log in

Navigate to `/login`. You will be redirected to your OIDC provider. On return you land on
the admin dashboard at `/dashboard`.

---

## Quickstart (Ansible)

Full role documentation lives in [ansible/README.md](ansible/README.md). Minimum steps:

### 1. Inventory

```bash
cp ansible/inventory.example.ini ansible/inventory.ini
# Edit ansible/inventory.ini — replace <host> with your server address
```

### 2. Variables

Either edit `ansible/group_vars/airplex.yml` directly or pass values at run time:

```bash
ansible-playbook ansible/site.yml \
  -i ansible/inventory.example.ini \
  --extra-vars "airplex_image=ghcr.io/yourname/airplex:latest \
                airplex_data_dir=/opt/airplex/data"
```

The role creates the data directory with `owner: 1000, group: 1000` to match the container
user, then writes the compose file and starts the service.

### 3. Syntax check

```bash
ansible-playbook ansible/site.yml --syntax-check -i ansible/inventory.example.ini
```

---

## Environment variables

All variables are server-only. No variable may use the `NEXT_PUBLIC_` prefix.

| Name                      | Default                        | Required | Purpose                                                                                                    |
| ------------------------- | ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `APP_URL`                 | —                              | yes      | Public base URL of the deployment, e.g. `https://airplex.example.com`. Must use `https://` in production.  |
| `DATABASE_URL`            | `file:/data/airplex.db`        | yes      | SQLite path. Must start with `file:`.                                                                      |
| `PLEX_BASE_URL`           | —                              | yes      | Base URL of your Plex Media Server, e.g. `http://plex.lan:32400`.                                          |
| `PLEX_TOKEN`              | —                              | yes      | Plex authentication token. Never sent to the browser.                                                      |
| `PLEX_CLIENT_IDENTIFIER`  | —                              | yes      | Plex client identifier string sent as `X-Plex-Client-Identifier`.                                          |
| `SESSION_SECRET`          | —                              | yes      | iron-session password for admin sessions. Minimum 32 bytes (64 hex chars).                                 |
| `DEVICE_LOCK_SECRET`      | —                              | yes      | iron-session password for per-link device cookies and segment encryption key derivation. Minimum 32 bytes. |
| `SHARE_TOKEN_SECRET`      | —                              | yes      | HMAC key for share token signatures. Minimum 32 bytes.                                                     |
| `OIDC_ISSUER_URL`         | —                              | yes      | OIDC discovery URL, e.g. `https://auth.example.com/application/o/airplex/`.                                |
| `OIDC_CLIENT_ID`          | —                              | yes      | Client ID from the OIDC provider.                                                                          |
| `OIDC_CLIENT_SECRET`      | —                              | yes      | Client secret from the OIDC provider.                                                                      |
| `OIDC_ADMIN_GROUPS`       | `""`                           | no       | Comma-separated list of group names. If non-empty, the user's groups claim must intersect this list.       |
| `OIDC_REDIRECT_URI`       | `${APP_URL}/api/auth/callback` | no       | Override the callback URL. Defaults to `APP_URL` + `/api/auth/callback`.                                   |
| `OIDC_GROUPS_CLAIM`       | `groups`                       | no       | Name of the claim in the ID token that contains group membership.                                          |
| `SHARE_DEFAULT_TTL_HOURS` | `48`                           | no       | Default TTL in hours when creating a share without specifying one.                                         |
| `SHARE_MAX_TTL_HOURS`     | `168`                          | no       | Maximum TTL in hours the admin is allowed to request.                                                      |
| `NODE_ENV`                | —                              | yes      | `production` or `development`. Set automatically by Docker.                                                |
| `LOG_LEVEL`               | `info`                         | no       | Pino log level: `trace`, `debug`, `info`, `warn`, `error`.                                                 |
| `TRUST_PROXY`             | `false`                        | no       | Set `true` when running behind a trusted reverse proxy that sets `X-Forwarded-For`.                        |

---

## Authentik / OIDC setup

These steps use Authentik; adapt the provider names for other IdPs.

1. In the Authentik admin panel, navigate to **Applications > Providers** and create a new
   **OAuth2/OpenID Connect Provider**.

2. Set **Client type** to `Confidential`. Copy the generated **Client ID** and
   **Client Secret** into your `.env` as `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`.

3. Under **Redirect URIs**, add exactly:

   ```
   https://airplex.example.com/api/auth/callback
   ```

   Replace the domain with your `APP_URL`. This must match `OIDC_REDIRECT_URI` exactly.

4. Set **Scopes** to include `openid`, `profile`, `email`, and `groups`. The `groups` scope
   causes Authentik to include group membership in the ID token.

5. If you want to restrict admin access to a specific Authentik group, set
   `OIDC_ADMIN_GROUPS=your-group-name` in `.env`. Users not in that group will be denied
   access to the dashboard even after a successful OIDC login.

6. From **Applications > Providers**, open the provider detail and copy the
   **OpenID Configuration URL** (ending in `/.well-known/openid-configuration`). Remove
   the trailing path to get the issuer URL and set it as `OIDC_ISSUER_URL`.

---

## How sharing works

1. The admin opens the dashboard and browses their Plex library via the library picker.
2. After selecting a movie or episode, they fill in the recipient's name, an optional note,
   and a TTL.
3. Clicking **Create link** calls `POST /api/admin/shares`. The response includes a one-time
   share URL. The token is shown exactly once and is not retrievable afterward.
4. The admin copies the URL and sends it to the recipient (text, email, or any channel).
5. The recipient opens the URL on their iPhone or iPad in Safari.
6. On first load the server atomically claims the link for the recipient's device
   fingerprint and sets an encrypted session cookie (`airplex_device_<id>`).
7. The recipient presses play. The player loads an HLS stream via `/api/hls/<id>/index.m3u8`.
   Segment paths are AES-GCM encrypted; the Plex token is injected by the proxy, never
   visible in the browser.
8. The recipient taps the AirPlay icon in the Safari video player and selects their Apple TV
   or AirPlay-capable display.
9. If a second device attempts to open the same link, the server detects a fingerprint
   mismatch and renders a "Link already claimed" page. The admin can reset the device lock
   from the dashboard if needed.

---

## Security notes

- **HMAC tokens, not JWTs.** Share tokens are `<random>.<mac>` where the MAC is a
  16-byte HMAC-SHA-256 truncated value. There is no decodable payload, so token structure
  reveals nothing about the share.
- **Device lock.** The first browser to open a link claims it via an atomic SQLite
  `UPDATE ... WHERE device_fingerprint_hash IS NULL`. Subsequent devices receive a 403.
  The cookie is an iron-session encrypted blob, not a plain identifier.
- **Encrypted segment paths.** HLS segment URLs are AES-256-GCM blobs derived from
  `sha256(DEVICE_LOCK_SECRET + linkId)`. The Plex token is appended by the proxy at
  request time and never appears in any client-visible URL or HTML.
- **No Referer leak.** All share pages send `Referrer-Policy: no-referrer` as an HTTP
  response header and include `<meta name="referrer" content="no-referrer">` in the HTML
  head. The share URL cannot be leaked via Referer to third-party resources.
- **HTTPS required.** iron-session cookies use `secure: true`. The application will not
  set device-lock cookies over plain HTTP in production.
- **Rate limiting.** Share page and HLS proxy routes are rate-limited in-process
  (token-bucket). The in-memory limiter is single-instance; document this constraint if
  you run multiple replicas behind a load balancer.

---

## Development

### Prerequisites

- Node.js 22 or later
- A running Plex Media Server reachable from your dev machine
- An OIDC provider (or a local stub — see `tests/integration/stubs/oidc.ts`)

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

The dev server starts at `http://localhost:3000`. Set `APP_URL=http://localhost:3000` and
`DATABASE_URL=file:./data/dev.db` in `.env.local` for local development.

### Type-check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

---

## Testing

### Unit tests

```bash
npm run test:unit
```

Runs Vitest against `tests/unit/`. Covers share-token crypto, device-lock helpers,
HLS manifest rewriting, Plex client header injection, env validation, and DB queries.

### Integration tests

Playwright is used for end-to-end tests with a stubbed OIDC provider and stubbed Plex
server running in-process. Install the Chromium browser on first run:

```bash
npx playwright install chromium
```

Then run:

```bash
npm run test:integration
```

The integration suite covers the full admin create-share flow and recipient claim + second-
device rejection.

---

## Deployment with jarch-bootstrap

airplex ships a Compose override for deployments that use the
[jarch-bootstrap](https://github.com/yourname/jarch-bootstrap) Ansible playbook. The
override attaches the container to the shared `jarch-public` Docker network and adds
Traefik routing labels so the existing Coolify-managed Traefik instance handles TLS
termination automatically.

```bash
docker compose -f docker-compose.yml -f docker-compose.jarch.yml up -d
```

Ensure the `jarch-public` external network exists before starting. The jarch-bootstrap
playbook creates it during the `03-docker` role run.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgements

- [Plex](https://www.plex.tv/) — media server and transcoding backend
- [Next.js](https://nextjs.org/) — React framework and API routes
- [iron-session](https://github.com/vvo/iron-session) — encrypted cookie sessions
- [openid-client](https://github.com/panva/node-openid-client) — OIDC/OAuth 2.0 client
- neopointer-ui — design tokens by the project author (CSS-only, no JS dependency)
