// src/plex/config.ts
//
// Unified accessor for the Plex token + base URL. Reads from the
// `settings` table first (populated by the /setup/plex PIN OAuth flow),
// falling back to env vars for legacy / compose-based deployments.
//
// Callers should use these helpers rather than reading env directly, so the
// admin can reconfigure Plex at runtime without restarting the server.

import { getSetting } from '@/db/queries/settings';
import { env } from '@/lib/env';

export function getPlexToken(): string | null {
  const stored = getSetting('plex_token');
  if (stored && stored.length > 0) return stored;
  return env.PLEX_TOKEN && env.PLEX_TOKEN.length > 0 ? env.PLEX_TOKEN : null;
}

export function getPlexBaseUrl(): string | null {
  const stored = getSetting('plex_server_url');
  if (stored && stored.length > 0) return stored.replace(/\/$/, '');
  return env.PLEX_BASE_URL && env.PLEX_BASE_URL.length > 0 ? env.PLEX_BASE_URL : null;
}

export function getPlexServerName(): string | null {
  return getSetting('plex_server_name');
}

export function isPlexConfigured(): boolean {
  return getPlexToken() !== null && getPlexBaseUrl() !== null;
}
