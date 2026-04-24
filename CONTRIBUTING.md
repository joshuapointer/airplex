# Contributing to airplex

Thanks for your interest. airplex is a small, opinionated project: a Plex share-link service designed around device-locked, ephemeral URLs. This document covers the day-to-day mechanics of proposing changes.

For deeper reading before you start:
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local setup and common workflows
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — running airplex in production

---

## Before you open a PR

1. **Open an issue first for anything non-trivial.** Small bug fixes and doc typos are fine to PR directly. For new features, protocol changes, or database schema changes, open an issue so we can agree on scope before you spend time coding.
2. **Scope each PR tightly.** One logical change per PR. A feature PR and a refactor PR are separate PRs. If you find yourself writing "Also, while I was in there…" — split it.
3. **Keep the diff small.** Aim for under 400 lines changed. Larger PRs are fine when the change is genuinely atomic (a migration + its query module, for example), but they take longer to review.

## Development workflow

Prereqs: Node 22+, Docker (optional, for full integration), a reachable Plex Media Server, an OIDC provider (or the stubbed test harness — see `docs/DEVELOPMENT.md`).

```bash
git clone https://github.com/yourname/airplex.git
cd airplex
npm install
cp .env.example .env   # fill in secrets — see the table in README.md
npm run gen-secrets    # prints three fresh 32-byte hex secrets
npm run dev            # next dev on :3000
```

Before committing:

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Integration tests (`npm run test:integration`) are slower — run them when touching share claim flow, HLS rewriting, or the device-lock state machine.

## Commit style

Conventional Commits, scoped by area. Subject line under ~72 chars, imperative mood.

```
fix(hls): rewrite nested m3u8 playlists so relative .ts URIs route through the proxy
feat(setup): PIN OAuth flow for browser-side plex.tv pairing
refactor(db): move share-token crypto out of route handlers
docs(dev): document the middleware + auth guard layering
```

Common scopes: `hls`, `setup`, `share`, `middleware`, `db`, `auth`, `dev`, `docs`, `ansible`, `docker`.

Do **not** include marketing verbs ("improve", "enhance"). State the mechanism and the reason. A future reader running `git blame` on a single line should be able to understand what changed and why without pulling up the PR.

## Code conventions

These rules exist because the codebase has hit each one as a real bug:

- **Never pass template literals to `better-sqlite3` `.exec()` / `.prepare()`.** An ESLint rule blocks it. Always use prepared statements with bound parameters. See `src/db/queries/shares.ts` for the pattern.
- **Share-token crypto lives in `src/lib/share-token.ts` only.** Route handlers must import `createShareToken` / `verifyShareTokenSignature` / `hashShareToken`. Re-implementing `randomBytes(16)` + HMAC in a route is a plan violation.
- **HLS manifest output must never contain `X-Plex-Token`.** `encodeSegmentBlob()` and `rewriteManifest()` both assert this. If you add a new code path that writes manifest-like content, add the same assertion.
- **No `NEXT_PUBLIC_*` env vars.** All configuration is server-only. The browser gets what the RSC renders — that's it. If you need a config value in the client, pass it as a prop from an RSC.
- **Never read `process.env.*` outside `src/lib/env.ts`.** Import from `env` so the schema validation is the one gate.
- **Next 15 cookie mutation rules.** `cookies().set(...)` only works inside Route Handlers and Server Actions — not Server Components. The `/s/[token]` share page enforces this by putting the claim/cookie-write inside a server action triggered by a form submit.
- **Share pages (`/s/*`) always set `Referrer-Policy: no-referrer` and `frame-ancestors 'none'`** — once at the `next.config.ts` headers layer and again in middleware. Defense in depth.

## Pull request checklist

- [ ] Issue linked (for non-trivial changes)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes
- [ ] Integration tests run if share/claim/HLS touched
- [ ] No `process.env.*` access outside `src/lib/env.ts`
- [ ] No `NEXT_PUBLIC_` env vars introduced
- [ ] No secrets in committed files (`.env` is git-ignored; double-check screenshots / logs)
- [ ] New DB columns have a migration in `src/db/migrations/` and a matching type in `src/types/share.d.ts` or similar
- [ ] Commit messages follow the style above

## Security-sensitive changes

Anything touching these areas gets extra scrutiny, and a PR description that calls out the security reasoning:

- Share-token generation, verification, or hashing
- Device-lock atomic claim (`UPDATE ... WHERE device_fingerprint_hash IS NULL`)
- HLS manifest rewriting and segment blob encryption
- `requireAdmin` / `requireShareAccess` guards
- Middleware auth gating and rate limiting
- OIDC callback validation (state / nonce / PKCE)
- Plex token handling (never logged, never sent to the browser, never in a URL)

If you're not sure whether a change is security-sensitive, ask in the issue first.

## Reporting vulnerabilities

Please **don't** open a public issue. Email the maintainer directly. We'll acknowledge within 72 hours.

## License

By contributing, you agree your contributions are released under the [MIT License](LICENSE).
