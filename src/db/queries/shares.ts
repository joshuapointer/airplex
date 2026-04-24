import type Database from 'better-sqlite3';
import { getDb } from '../client';
import type { ShareRow, ShareStatus } from '@/types/share';

// ---------- prepared-statement cache ----------

let _stmts: {
  insert: Database.Statement<
    [
      string, // id
      string, // token_hash
      string, // plex_rating_key
      string, // title
      string, // plex_media_type
      string, // recipient_label
      string | null, // recipient_note
      string | null, // sender_label
      string | null, // poster_path
      number, // created_at
      number, // expires_at
      number | null, // max_plays
      number, // play_count
      string | null, // device_fingerprint_hash
      number | null, // device_locked_at
      number | null, // revoked_at
      string, // created_by_sub
    ]
  >;
  getById: Database.Statement<[string], ShareRow>;
  getByTokenHash: Database.Statement<[string], ShareRow>;
  listAll: Database.Statement<[], ShareRow>;
  claimDevice: Database.Statement<[string, number, string]>;
  resetDevice: Database.Statement<[string]>;
  revokeShare: Database.Statement<[number, string]>;
  extendShare: Database.Statement<[number, string]>;
  incrementPlayCount: Database.Statement<[string]>;
} | null = null;

function stmts() {
  if (_stmts) return _stmts;
  const db = getDb();
  _stmts = {
    insert: db.prepare(
      'INSERT INTO shares (\n' +
        '  id, token_hash, plex_rating_key, title, plex_media_type,\n' +
        '  recipient_label, recipient_note, sender_label, poster_path,\n' +
        '  created_at, expires_at, max_plays,\n' +
        '  play_count, device_fingerprint_hash, device_locked_at, revoked_at,\n' +
        '  created_by_sub\n' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    getById: db.prepare('SELECT * FROM shares WHERE id = ?'),
    getByTokenHash: db.prepare('SELECT * FROM shares WHERE token_hash = ?'),
    listAll: db.prepare('SELECT * FROM shares ORDER BY created_at DESC'),
    claimDevice: db.prepare(
      'UPDATE shares\n' +
        '  SET device_fingerprint_hash = ?, device_locked_at = ?\n' +
        '  WHERE id = ? AND device_fingerprint_hash IS NULL',
    ),
    resetDevice: db.prepare(
      'UPDATE shares\n' +
        '  SET device_fingerprint_hash = NULL, device_locked_at = NULL\n' +
        '  WHERE id = ?',
    ),
    revokeShare: db.prepare('UPDATE shares SET revoked_at = ? WHERE id = ?'),
    extendShare: db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?'),
    incrementPlayCount: db.prepare('UPDATE shares SET play_count = play_count + 1 WHERE id = ?'),
  };
  return _stmts;
}

/**
 * Test-only: reset the prepared-statement cache when the db singleton is
 * replaced (e.g. between unit tests using an in-memory db).
 */
export function __resetStmtsForTests(): void {
  _stmts = null;
}

// ---------- public API ----------

export function insertShare(row: ShareRow): void {
  stmts().insert.run(
    row.id,
    row.token_hash,
    row.plex_rating_key,
    row.title,
    row.plex_media_type,
    row.recipient_label,
    row.recipient_note,
    row.sender_label,
    row.poster_path,
    row.created_at,
    row.expires_at,
    row.max_plays,
    row.play_count,
    row.device_fingerprint_hash,
    row.device_locked_at,
    row.revoked_at,
    row.created_by_sub,
  );
}

export function getShareById(id: string): ShareRow | null {
  return (stmts().getById.get(id) as ShareRow | undefined) ?? null;
}

export function getShareByTokenHash(hash: string): ShareRow | null {
  return (stmts().getByTokenHash.get(hash) as ShareRow | undefined) ?? null;
}

export type ListSharesFilter = { status?: 'active' | 'expired' | 'revoked' };

export function listShares(filter: ListSharesFilter = {}): ShareRow[] {
  const all = stmts().listAll.all() as ShareRow[];
  if (!filter.status) return all;
  const now = Math.floor(Date.now() / 1000);
  return all.filter((row) => {
    const status = computeShareStatus(row, now);
    if (filter.status === 'revoked') return status.revoked;
    if (filter.status === 'expired') return status.expired && !status.revoked;
    if (filter.status === 'active') return status.active;
    return true;
  });
}

/**
 * Atomic first-device claim. Succeeds exactly once per share, even under races.
 * Returns true if this call won the claim (row updated).
 */
export function claimDevice(id: string, fp: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const info = stmts().claimDevice.run(fp, now, id);
  return info.changes > 0;
}

export function resetDevice(id: string): void {
  stmts().resetDevice.run(id);
}

export function revokeShare(id: string): void {
  const now = Math.floor(Date.now() / 1000);
  stmts().revokeShare.run(now, id);
}

export function extendShare(id: string, newExpiresAt: number): void {
  stmts().extendShare.run(newExpiresAt, id);
}

export function incrementPlayCount(id: string): void {
  stmts().incrementPlayCount.run(id);
}

/**
 * Pure derivation of a share's effective status from its row + a clock.
 * Does NOT read the database.
 */
export function computeShareStatus(row: ShareRow, now?: number): ShareStatus {
  const t = now ?? Math.floor(Date.now() / 1000);
  const revoked = row.revoked_at !== null;
  const expired = row.expires_at <= t;
  const exhausted = row.max_plays !== null && row.play_count >= row.max_plays;
  const claimed = row.device_fingerprint_hash !== null;
  const active = !revoked && !expired && !exhausted;
  return { active, expired, revoked, exhausted, claimed };
}
