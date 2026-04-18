# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage: deps
# Install Node dependencies (including native addon build deps for
# better-sqlite3). Scripts are skipped here; the native rebuild happens in
# the build stage where source is also present.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------
# Stage: build
# Copy source, rebuild the better-sqlite3 native addon, then run Next build.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Reuse installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

COPY . .

# Rebuild the native addon against the current Node binary
RUN npm rebuild better-sqlite3

# Build-time env stubs — Next.js validates env at page-data collection time.
# These dummy values satisfy the schema; real secrets come from env_file at runtime.
ARG SESSION_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ARG DEVICE_LOCK_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
ARG SHARE_TOKEN_SECRET=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
ARG APP_URL=https://placeholder.example.com
ARG DATABASE_URL=file:/tmp/build.db
ARG PLEX_CLIENT_IDENTIFIER=airplex-build
ARG OIDC_ISSUER_URL=https://placeholder.example.com/application/o/placeholder/
ARG OIDC_CLIENT_ID=placeholder
ARG OIDC_CLIENT_SECRET=placeholder
ENV SESSION_SECRET=$SESSION_SECRET \
    DEVICE_LOCK_SECRET=$DEVICE_LOCK_SECRET \
    SHARE_TOKEN_SECRET=$SHARE_TOKEN_SECRET \
    APP_URL=$APP_URL \
    DATABASE_URL=$DATABASE_URL \
    PLEX_CLIENT_IDENTIFIER=$PLEX_CLIENT_IDENTIFIER \
    OIDC_ISSUER_URL=$OIDC_ISSUER_URL \
    OIDC_CLIENT_ID=$OIDC_CLIENT_ID \
    OIDC_CLIENT_SECRET=$OIDC_CLIENT_SECRET

RUN npm run build

# ---------------------------------------------------------------------------
# Stage: runtime
# Lean production image — only the standalone output, static assets, and
# the public directory (created unconditionally; may be empty).
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN apk add --no-cache su-exec tini

ENV NODE_ENV=production

WORKDIR /app

# Standalone server bundle
COPY --from=build /app/.next/standalone ./

# Static assets (CSS/JS chunks, images)
COPY --from=build /app/.next/static ./.next/static

# Public directory — create it first so the COPY works even if the source
# is empty or does not exist (Next.js uses it for favicon.ico etc.)
RUN mkdir -p ./public
COPY --from=build /app/public ./public

# Database migrations — copied to the same relative path (src/db/migrations/)
# so migrate.ts can resolve them via process.cwd() at runtime.
COPY --from=build /app/src/db/migrations ./src/db/migrations

# Persistent data directory — owned by node (uid/gid 1000) so SQLite can
# write to it at runtime. The entrypoint shim re-chowns on bind-mount start
# when the host directory is root-owned.
RUN mkdir -p /data && chown -R 1000:1000 /data

# Entrypoint shim: chowns /data if writable as root, then drops to uid 1000
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
