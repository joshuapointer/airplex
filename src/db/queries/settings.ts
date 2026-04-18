import type Database from 'better-sqlite3';
import { getDb } from '../client';
import { runMigrations } from '../migrate';

// ---------- prepared-statement cache ----------

let _stmts: {
  get: Database.Statement<[string], { value: string }>;
  upsert: Database.Statement<[string, string, number]>;
  del: Database.Statement<[string]>;
} | null = null;

function stmts() {
  if (_stmts) return _stmts;
  // Settings is introduced in migration 0003; ensure schema is up to date
  // before preparing statements against it.
  runMigrations();
  const db = getDb();
  _stmts = {
    get: db.prepare('SELECT value FROM settings WHERE key = ?'),
    upsert: db.prepare(
      'INSERT INTO settings (key, value, updated_at)\n' +
        '     VALUES (?, ?, ?)\n' +
        '  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    ),
    del: db.prepare('DELETE FROM settings WHERE key = ?'),
  };
  return _stmts;
}

/**
 * Test-only: reset the prepared-statement cache when the db singleton is
 * replaced (e.g. between unit tests using an in-memory db).
 */
export function __resetSettingsStmtsForTests(): void {
  _stmts = null;
}

// ---------- public API ----------

export function getSetting(key: string): string | null {
  const row = stmts().get.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const now = Math.floor(Date.now() / 1000);
  stmts().upsert.run(key, value, now);
}

export function deleteSetting(key: string): void {
  stmts().del.run(key);
}
