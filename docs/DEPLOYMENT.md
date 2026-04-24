# Deployment

airplex ships as a single container, stateful on a bind-mounted SQLite volume. This guide covers three deployment patterns:

1. **Plain Docker Compose** — one host, you manage TLS.
2. **Compose with the `jarch-public` overlay** — one host, Traefik + letsencrypt already running.
3. **Ansible** — reproducible provisioning on a remote host.

---

## Prereqs

- Docker Engine 24+ on the target host
- A public DNS record (A or AAAA) pointing at the host
- A TLS-terminating reverse proxy if you're not using the jarch overlay
- An OIDC provider (Authentik, Keycloak, Auth0, any PKCE-capable issuer)
- A running Plex Media Server reachable from the container

Generate secrets before you start:

```bash
npm run gen-secrets
# or:
openssl rand -hex 32   # run three times, one per secret
```

Keep the three secrets distinct. They end up as `SESSION_SECRET`, `DEVICE_LOCK_SECRET`, `SHARE_TOKEN_SECRET`. Each must decode to at least 32 bytes — hex and base64 are both accepted.

---

## Pattern 1: Plain Docker Compose

Good for a VPS where you run your own reverse proxy.

```bash
git clone https://github.com/yourname/airplex.git
cd airplex
cp .env.example .env
# edit .env: fill in APP_URL, PLEX_*, OIDC_*, secrets
docker compose up -d
```

The default `docker-compose.yml` exposes port 3000 on the host. Wire your reverse proxy (Caddy, nginx, standalone Traefik) to forward `airplex.example.com` → `127.0.0.1:3000`. The app itself speaks HTTP on 3000; TLS termination is your proxy's job.

Data lives in `./data/` (bind-mounted to `/data` inside the container, owned by uid 1000).

---

## Pattern 2: Compose with the jarch overlay

Good for hosts provisioned by [jarch-bootstrap](https://github.com/yourname/jarch-bootstrap), which ships Traefik + letsencrypt on a `jarch-public` Docker network.

```bash
# .env already contains APP_URL=https://airplex.example.com + secrets
docker compose \
  -f docker-compose.yml \
  -f docker-compose.jarch.yml \
  up -d
```

The overlay:

- Joins the `jarch-public` external network (must already exist)
- Adds Traefik labels: Host match on `APP_URL`, `https` entrypoint, `letsencrypt` certresolver
- Removes the host-port mapping (traffic goes through Traefik)

If your Traefik is fronted by Cloudflare, expect a brief 526 window on first deploy while the letsencrypt HTTP-01 challenge completes. Cache clears on its own once the cert is issued.

---

## Pattern 3: Ansible

For fleet-style provisioning or CI-driven deploys.

```bash
ansible-galaxy collection install -r ansible/requirements.yml

cp ansible/inventory.example.ini ansible/inventory.ini
# edit inventory.ini — replace airplex.example.com with your host

mkdir -p host_vars
cat > host_vars/<host>.yml <<'EOF'
airplex_app_url:           "https://airplex.example.com"
airplex_plex_base_url:     "http://plex.lan:32400"
airplex_plex_token:        "CHANGEME"
airplex_plex_client_identifier: "airplex"
airplex_session_secret:    "64-hex-chars"
airplex_device_lock_secret:"64-hex-chars"
airplex_share_token_secret:"64-hex-chars"
airplex_oidc_issuer_url:   "https://auth.example.com/application/o/airplex/"
airplex_oidc_client_id:    "airplex"
airplex_oidc_client_secret:"CHANGEME"
airplex_domain:            "airplex.example.com"
EOF

ansible-playbook ansible/site.yml \
  -i ansible/inventory.ini \
  --ask-become-pass
```

Full variable reference: `ansible/README.md`. Key knobs:

| Variable                 | Default                        | Purpose                                         |
| ------------------------ | ------------------------------ | ----------------------------------------------- |
| `airplex_image`          | `ghcr.io/OWNER/airplex:latest` | Container image to pull                         |
| `airplex_install_dir`    | `/opt/airplex`                 | Compose + .env location                         |
| `airplex_data_dir`       | `/opt/airplex/data`            | SQLite volume (must be local FS, not NFS)       |
| `airplex_env_source`     | `vars`                         | `vars` (templated) or `sops` (pre-materialized) |
| `airplex_docker_network` | `airplex_default`              | Set to `jarch-public` on jarch hosts            |

SOPS mode: when your secrets role has already materialised `/run/secrets/airplex.env`, set `airplex_env_source: 'sops'`. The role asserts the file exists and skips templating.

Do a syntax check before running:

```bash
ansible-playbook ansible/site.yml --syntax-check -i ansible/inventory.example.ini
```

---

## OIDC setup

Steps shown for Authentik; adapt for other IdPs.

1. **Applications → Providers → Create → OAuth2/OpenID**
   - Client type: **Confidential**
   - Authorization flow: `default-provider-authorization-implicit-consent`
   - Invalidation flow: `default-provider-invalidation-flow` (required in Authentik ≥ 2024.4)
   - Redirect URIs: `https://airplex.example.com/api/auth/callback` (list form, `matching_mode: strict`)
   - Scopes: `openid`, `profile`, `email`
   - Signing key: Authentik Self-signed Certificate (default)
2. **Applications → Applications → Create**
   - Slug must match the issuer URL path (default: `airplex`)
   - Link the provider you just made
3. Copy the **Client ID** and **Client Secret** into `.env` as `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
4. The issuer URL is `https://your-authentik-host/application/o/<slug>/`. Trailing slash matters.

To restrict admin access to a specific group, set `OIDC_ADMIN_GROUPS=group-name` (comma-separated for multiple). Leave empty to allow any authenticated user.

On a jarch host with bootstrap Authentik and an API token in `authentik-server`'s env, you can script all of this via the Authentik REST API (`POST /api/v3/providers/oauth2/` then `POST /api/v3/core/applications/`).

---

## Plex setup

Two paths, in order of preference:

1. **PIN OAuth (recommended).** Leave `PLEX_BASE_URL` and `PLEX_TOKEN` blank in `.env`. After the first admin login, airplex redirects you to `/setup/plex`. Click **Sign in with Plex**, complete the PIN flow (opens plex.tv in the browser), then pick your server from the list. The resulting token and server URL are stored in the `settings` table and take precedence over env values.

2. **Env-based.** Fill `PLEX_BASE_URL` (e.g. `http://plex.lan:32400`) and `PLEX_TOKEN` directly in `.env`. Useful when you're restoring state or pre-seeding the deployment.

When picking a server URL manually, prefer the Plex `.plex.direct` subdomain that Plex generates for your public IP (format: `https://<ip-with-dashes>.<hash>.plex.direct:<port>`). LAN-only IPv6 ULA addresses won't be reachable from a VPS.

---

## Upgrading

The safe order:

1. Pull or rebuild the new image.
2. `docker compose up -d` — compose recreates the container.
3. Watch logs until the migrate step finishes and the health check flips green.

Migrations run inside the container's entrypoint (`scripts/migrate-runtime.cjs`) before the server starts. Failures abort the boot — the container stays down with logs explaining what went wrong rather than half-migrating. Back up `/data/airplex.db` before a migration if the schema change is non-trivial.

Docker restart semantics to know about:

- `docker compose restart airplex` does **not** re-read the env file. It keeps the create-time env.
- `docker compose up -d --force-recreate` destroys and recreates the container, picking up new env values.

For Ansible-managed deploys, `community.docker.docker_compose_v2` with `state: present` and `pull: always` achieves the same.

---

## Backups

`/data/airplex.db` is the whole state. SQLite WAL mode means a plain `cp` while the server is running can capture a partial write. Use `sqlite3 /data/airplex.db ".backup /tmp/backup.db"` inside the container for a consistent snapshot:

```bash
docker exec airplex sh -c 'node -e "
  const Database = require(\"better-sqlite3\");
  const src = new Database(\"/data/airplex.db\");
  src.backup(\"/data/backup.db\").then(() => src.close());
"'
docker cp airplex:/data/backup.db ./backup-$(date +%F).db
```

Keep backups encrypted at rest. The DB contains `token_hash` values (not reversible to tokens) but leaking an active device fingerprint hash lets an attacker bypass the device-lock cookie if they can also hit the HLS routes.

---

## Reverse proxy notes

- `APP_URL` must be `https://` in production. iron-session cookies are set with `secure: true` and won't survive plain HTTP.
- Set `TRUST_PROXY=true` when you sit behind any reverse proxy. Middleware reads `x-forwarded-for` only when this is on.
- `Host` header must match `APP_URL`. OIDC redirect URI validation is exact.
- The share page routes (`/s/*`) and dashboard (`/dashboard/*`) set `Referrer-Policy: no-referrer` and `frame-ancestors 'none'` twice — once at `next.config.ts` and once in middleware. If your proxy adds or rewrites `Referrer-Policy`, don't weaken it.

---

## Monitoring

`/api/health` is a public endpoint (excluded from middleware): returns `{"status":"ok","version":"<npm_version>","ts":<unix_ms>}`. Use it as a reverse-proxy health check and for uptime monitoring.

There's no built-in metrics export. If you need Prometheus, either wrap the container in a sidecar that scrapes logs or add a `/metrics` route locally (and gate it behind `requireAdmin` or a separate shared-secret header).

---

## Troubleshooting

- **Container keeps restarting with `Invalid environment configuration`** — the env schema rejected something. Read the full zod error in the logs; it names the offending variable and why.
- **`no such table: shares` on first request** — migrations didn't run. Check that `src/db/migrations/` made it into the image (Dockerfile COPY) and that `docker/entrypoint.sh` is the `ENTRYPOINT`. The log line `[migrate] applied: …` or `[migrate] up to date` should appear before `Ready in ###ms`.
- **`Failed to find Server Action "…"` in logs** — benign during a hot deploy. The browser held a stale reference from a previous build; the user retrying resolves it.
- **Cloudflare 526 after initial deploy** — letsencrypt HTTP-01 challenge hasn't completed. Wait a minute, then retry. If it persists, check `docker logs coolify-proxy` (or whatever Traefik is running) for ACME errors — most commonly: DNS not resolving, port 80 blocked, or rate-limit after too many failed attempts.
- **Admin "forbidden"** — your OIDC user isn't in `OIDC_ADMIN_GROUPS`. Either add them to the group or drop the restriction.

---

## Production checklist

- [ ] All three secrets generated fresh (not the `.env.example` defaults, not reused from staging)
- [ ] `APP_URL` uses `https://`
- [ ] DNS resolving correctly (A / AAAA + certificate)
- [ ] OIDC redirect URI matches `${APP_URL}/api/auth/callback` exactly
- [ ] `TRUST_PROXY=true` if behind any proxy
- [ ] `LOG_LEVEL=info` (not `debug`) in production
- [ ] `/api/health` responds 200 through the reverse proxy
- [ ] `/login` redirects to your OIDC provider
- [ ] Data directory is on local disk, not NFS (SQLite + NFS = corruption)
- [ ] Backups configured on a schedule
- [ ] Log drain or retention configured (pino outputs JSON to stdout)
