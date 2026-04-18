import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '@/lib/env';

let _db: Database.Database | null = null;

/**
 * Parse a `file:` URL from env.DATABASE_URL to a filesystem path.
 * Allows the special `file::memory:` sentinel in test mode.
 */
function resolveDbPath(url: string): string {
  // Strip `file:` prefix. Accept `file:/abs/path`, `file:./rel`, `file::memory:`.
  if (!url.startsWith('file:')) {
    throw new Error(`DATABASE_URL must start with "file:" — got "${url}"`);
  }
  const rest = url.slice('file:'.length);
  if (rest === ':memory:') {
    if (env.NODE_ENV !== 'test') {
      throw new Error('file::memory: is only allowed when NODE_ENV=test');
    }
    return ':memory:';
  }
  return rest;
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = resolveDbPath(env.DATABASE_URL);

  if (dbPath !== ':memory:') {
    const parent = path.dirname(dbPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  _db = db;
  return _db;
}

/**
 * Test-only: drop the singleton so a new path can be opened.
 * Exported for internal (migrate/tests) use; not part of a public contract.
 */
export function __resetDbForTests(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      /* noop */
    }
  }
  _db = null;
}
