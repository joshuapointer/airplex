/**
 * HLS manifest rewriter + encrypted segment blob crypto.
 *
 * Every Plex-pointing URI in the manifest is replaced with an app-local
 * opaque URL of the form `/api/hls/<linkId>/seg/<blob>` where `<blob>` is
 * an AES-256-GCM ciphertext of the original Plex-relative path (query
 * string included, X-Plex-Token stripped). The proxy layer decrypts the
 * blob, re-attaches the Plex token server-side, and streams bytes back.
 *
 * Rationale: recipients must never see Plex URLs or tokens; segment URIs
 * must be unguessable and tamper-evident per link.
 */
import crypto from 'node:crypto';

import { env } from '@/lib/env';

// -----------------------------------------------------------------------------
// Public types (per plan §A.6)
// -----------------------------------------------------------------------------

export interface RewriteArgs {
  manifest: string;
  linkId: string;
  plexBaseUrl: string;
}

export interface RewriteResult {
  manifest: string;
  segments: number;
}

// -----------------------------------------------------------------------------
// Blob crypto
// -----------------------------------------------------------------------------

/**
 * Derive a deterministic 32-byte key from the device-lock secret and the
 * link id. A per-link key makes a blob leaked from one share unusable
 * against another share, and lets us rotate simply by rotating link ids.
 */
function deriveKey(linkId: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(env.DEVICE_LOCK_SECRET + linkId)
    .digest();
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(s: string): Buffer {
  const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * Strip any X-Plex-Token query parameter from a path+query string.
 * Works on inputs that may or may not have a query string, and keeps any
 * other query params intact. We intentionally do NOT URL-parse with a
 * base URL here because input paths are Plex-relative paths (possibly
 * with odd Plex-specific encodings we want to preserve byte-for-byte).
 */
function stripPlexToken(pathAndQuery: string): string {
  const qIdx = pathAndQuery.indexOf('?');
  if (qIdx < 0) return pathAndQuery;
  const path = pathAndQuery.slice(0, qIdx);
  const query = pathAndQuery.slice(qIdx + 1);
  if (query.length === 0) return path;
  const kept = query
    .split('&')
    .filter((kv) => {
      const eq = kv.indexOf('=');
      const key = eq < 0 ? kv : kv.slice(0, eq);
      return key !== 'X-Plex-Token';
    })
    .join('&');
  return kept.length > 0 ? `${path}?${kept}` : path;
}

/**
 * AES-256-GCM encrypt `originalPath` (already token-stripped by caller),
 * returning base64url(nonce || ciphertext || tag).
 */
export function encodeSegmentBlob(originalPath: string, linkId: string): string {
  const sanitized = stripPlexToken(originalPath);
  if (sanitized.includes('X-Plex-Token')) {
    throw new Error('encodeSegmentBlob: X-Plex-Token leaked into plaintext');
  }
  const key = deriveKey(linkId);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(sanitized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return base64urlEncode(Buffer.concat([nonce, ciphertext, tag]));
}

/**
 * Inverse of encodeSegmentBlob. Throws on auth-tag mismatch — either the
 * blob was tampered with or it was encoded under a different linkId.
 */
export function decodeSegmentBlob(blob: string, linkId: string): string {
  const raw = base64urlDecode(blob);
  if (raw.length < 12 + 16) {
    throw new Error('decodeSegmentBlob: blob too short');
  }
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);
  const key = deriveKey(linkId);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// -----------------------------------------------------------------------------
// Manifest rewriting
// -----------------------------------------------------------------------------

/**
 * Plex's `start.m3u8` lives at `/video/:/transcode/universal/start.m3u8`,
 * so relative URIs inside it (and nested playlists it references) resolve
 * against that directory. We don't try to track per-manifest context
 * because every m3u8 we proxy for a given linkId originates from the same
 * transcode session rooted at this base.
 */
const PLEX_MANIFEST_DIR = '/video/:/transcode/universal/';

/**
 * Resolve a URI found in the manifest to a Plex-relative path+query (with
 * leading `/`), or null if the URI is absolute and not under plexBaseUrl
 * (external CDN — leave alone).
 */
function resolveToPlexPath(uri: string, plexBaseUrl: string): string | null {
  const trimmed = uri.trim();
  if (trimmed.length === 0) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.startsWith(plexBaseUrl)) {
      const rest = trimmed.slice(plexBaseUrl.length);
      return rest.startsWith('/') ? rest : '/' + rest;
    }
    return null;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // Relative URI — resolve against Plex's transcode dir.
  return PLEX_MANIFEST_DIR + trimmed;
}

function rewriteOne(
  uri: string,
  linkId: string,
  plexBaseUrl: string,
): { rewritten: string; changed: boolean } {
  const plexPath = resolveToPlexPath(uri, plexBaseUrl);
  if (plexPath === null) {
    return { rewritten: uri, changed: false };
  }
  const blob = encodeSegmentBlob(plexPath, linkId);
  return { rewritten: `/api/hls/${linkId}/seg/${blob}`, changed: true };
}

/**
 * Rewrite `URI="..."` attributes inside a tag line. Handles multiple
 * URI attributes defensively (EXT-X-MEDIA rarely has more than one, but
 * nothing in the spec forbids it).
 */
function rewriteTagUriAttrs(
  line: string,
  linkId: string,
  plexBaseUrl: string,
): { line: string; count: number } {
  let count = 0;
  const out = line.replace(/URI="([^"]*)"/g, (_m, uri: string) => {
    const { rewritten, changed } = rewriteOne(uri, linkId, plexBaseUrl);
    if (changed) count += 1;
    return `URI="${rewritten}"`;
  });
  return { line: out, count };
}

/**
 * Rewrite a full HLS manifest. See module docstring for behavior.
 */
export function rewriteManifest(args: RewriteArgs): RewriteResult {
  const { manifest, linkId, plexBaseUrl } = args;
  const lines = manifest.split(/\r?\n/);
  let segments = 0;

  const outLines = lines.map((line) => {
    if (line.length === 0) return line;

    if (line.startsWith('#')) {
      // Tag lines with URI attributes: EXT-X-MAP, EXT-X-KEY, EXT-X-MEDIA,
      // EXT-X-I-FRAME-STREAM-INF. We match on the attribute itself, not
      // the tag name, so any future tag with URI="..." is also covered.
      if (line.includes('URI="')) {
        const { line: rewritten, count } = rewriteTagUriAttrs(line, linkId, plexBaseUrl);
        segments += count;
        return rewritten;
      }
      return line;
    }

    // Non-comment, non-empty line → URI (segment or nested playlist).
    const { rewritten, changed } = rewriteOne(line, linkId, plexBaseUrl);
    if (changed) segments += 1;
    return rewritten;
  });

  const out = outLines.join('\n');
  if (out.includes('X-Plex-Token')) {
    throw new Error('rewriteManifest: X-Plex-Token leaked into output');
  }
  return { manifest: out, segments };
}
