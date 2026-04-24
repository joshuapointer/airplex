import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../client';
import type { ShareEventKind } from '@/types/share';
import type { EventTailRow } from '@/types/transmission';

// ---------- daily IP salt (in-memory, rotates per UTC day) ----------

let _currentSalt: Buffer | null = null;
let _currentDay: number | null = null;

function currentDay(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function getDailySalt(): Buffer {
  const day = currentDay();
  if (_currentSalt === null || _currentDay !== day) {
    _currentSalt = crypto.randomBytes(16);
    _currentDay = day;
  }
  return _currentSalt;
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = getDailySalt();
  return crypto.createHash('sha256').update(salt).update(ip).digest('hex');
}

function hashUa(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16);
}

// ---------- prepared statement ----------

let _insertStmt: Database.Statement<
  [string, number, string, string | null, string | null, string | null]
> | null = null;

function insertStmt() {
  if (_insertStmt) return _insertStmt;
  _insertStmt = getDb().prepare(
    'INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail)\n' +
      '     VALUES (?, ?, ?, ?, ?, ?)',
  );
  return _insertStmt;
}

// ---------- public API ----------

export interface LogEventArgs {
  share_id: string;
  kind: ShareEventKind;
  ip?: string | null;
  userAgent?: string | null;
  detail?: unknown;
}

export function logEvent(args: LogEventArgs): void {
  const at = Math.floor(Date.now() / 1000);
  const ip_hash = hashIp(args.ip);
  const ua_hash = hashUa(args.userAgent);
  const detail =
    args.detail === undefined || args.detail === null
      ? null
      : typeof args.detail === 'string'
        ? args.detail
        : JSON.stringify(args.detail);
  insertStmt().run(args.share_id, at, args.kind, ip_hash, ua_hash, detail);
}

// ---------- live-window helpers ----------

/** 4× ShareWatcher.PING_INTERVAL_MS (30s). Used for admin "Now Live" derivation. */
export const LIVE_WINDOW_S = 120;

let _recentPlayStmt: Database.Statement<[number]> | null = null;

function recentPlayStmt() {
  if (_recentPlayStmt) return _recentPlayStmt;
  _recentPlayStmt = getDb().prepare<[number]>(
    "SELECT DISTINCT share_id FROM share_events WHERE kind = 'play' AND at >= ?",
  );
  return _recentPlayStmt;
}

export function getRecentPlayShareIds(withinSeconds: number = LIVE_WINDOW_S): Set<string> {
  const threshold = Math.floor(Date.now() / 1000) - withinSeconds;
  const rows = recentPlayStmt().all(threshold) as { share_id: string }[];
  return new Set(rows.map((r) => r.share_id));
}

// ---------- event tail ----------

let _recentEventsStmt: Database.Statement<[number]> | null = null;

function recentEventsStmt() {
  if (_recentEventsStmt) return _recentEventsStmt;
  _recentEventsStmt = getDb().prepare<[number]>(
    'SELECT\n' +
      '  e.id, e.at, e.kind, e.share_id, e.detail,\n' +
      '  s.recipient_label AS recipient_label\n' +
      'FROM share_events e\n' +
      'LEFT JOIN shares s ON s.id = e.share_id\n' +
      'ORDER BY e.at DESC\n' +
      'LIMIT ?',
  );
  return _recentEventsStmt;
}

interface RawEventRow {
  id: number;
  at: number;
  kind: ShareEventKind;
  share_id: string;
  detail: string | null;
  recipient_label: string | null;
}

function buildShortDetail(kind: ShareEventKind, detail: string | null): string | null {
  let parsed: Record<string, unknown> | null = null;
  if (detail) {
    try {
      parsed = JSON.parse(detail) as Record<string, unknown>;
    } catch {
      // non-JSON detail — ignore
    }
  }
  switch (kind) {
    case 'claimed': {
      const fp = typeof parsed?.device_fp === 'string' ? parsed.device_fp : null;
      return fp ? fp.slice(-16) : 'device';
    }
    case 'rejected_device':
      return 'rejected';
    case 'created': {
      const ttl = typeof parsed?.ttl_hours === 'number' ? parsed.ttl_hours : null;
      return ttl !== null ? `${ttl}h ttl` : 'created';
    }
    case 'revoked':
      return 'revoked';
    case 'play':
      return 'play';
    case 'reset': {
      const action = typeof parsed?.action === 'string' ? parsed.action : null;
      if (action === 'extended') {
        const hours = typeof parsed?.hours === 'number' ? parsed.hours : null;
        return hours !== null ? `+${hours}h` : 'reset';
      }
      return 'reset';
    }
    case 'expired':
      return 'expired';
    default:
      return null;
  }
}

export function listRecentEventsWithShare(limit: number = 5): EventTailRow[] {
  const rows = recentEventsStmt().all(limit) as RawEventRow[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    share_id: r.share_id,
    recipient_label: r.recipient_label,
    short_detail: buildShortDetail(r.kind, r.detail),
  }));
}
