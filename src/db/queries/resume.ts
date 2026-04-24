import type Database from 'better-sqlite3';
import { getDb } from '../client';

export interface ResumePositionRow {
  share_id: string;
  rating_key: string;
  position_ms: number;
  duration_ms: number | null;
  updated_at: number;
}

let _stmts: {
  get: Database.Statement<[string, string], ResumePositionRow>;
  upsert: Database.Statement<[string, string, number, number | null, number]>;
  listByShare: Database.Statement<[string], ResumePositionRow>;
  clear: Database.Statement<[string, string]>;
} | null = null;

function stmts() {
  if (_stmts) return _stmts;
  const db = getDb();
  _stmts = {
    get: db.prepare(
      'SELECT * FROM resume_positions WHERE share_id = ? AND rating_key = ?',
    ),
    upsert: db.prepare(
      'INSERT INTO resume_positions (share_id, rating_key, position_ms, duration_ms, updated_at)\n' +
        '  VALUES (?, ?, ?, ?, ?)\n' +
        '  ON CONFLICT(share_id, rating_key) DO UPDATE SET\n' +
        '    position_ms = excluded.position_ms,\n' +
        '    duration_ms = excluded.duration_ms,\n' +
        '    updated_at  = excluded.updated_at',
    ),
    listByShare: db.prepare(
      'SELECT * FROM resume_positions WHERE share_id = ? ORDER BY updated_at DESC',
    ),
    clear: db.prepare(
      'DELETE FROM resume_positions WHERE share_id = ? AND rating_key = ?',
    ),
  };
  return _stmts;
}

export function __resetResumeStmtsForTests(): void {
  _stmts = null;
}

export function getResumePosition(
  shareId: string,
  ratingKey: string,
): ResumePositionRow | null {
  return (
    (stmts().get.get(shareId, ratingKey) as ResumePositionRow | undefined) ?? null
  );
}

export function saveResumePosition(
  shareId: string,
  ratingKey: string,
  positionMs: number,
  durationMs: number | null,
): void {
  const now = Math.floor(Date.now() / 1000);
  stmts().upsert.run(shareId, ratingKey, positionMs, durationMs, now);
}

export function listResumePositions(shareId: string): ResumePositionRow[] {
  return stmts().listByShare.all(shareId) as ResumePositionRow[];
}

export function clearResumePosition(shareId: string, ratingKey: string): void {
  stmts().clear.run(shareId, ratingKey);
}
