import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../client';
import type { ShareEventKind } from '@/types/share';

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
