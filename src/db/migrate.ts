import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './client';

// Use process.cwd() so this resolves correctly in both dev and standalone
// Docker builds (where __dirname would be the bundled server directory, not
// the source tree). The Dockerfile copies src/db/migrations/ to the same
// relative path inside the standalone output.
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/db/migrations');

/**
 * Apply every SQL file in `src/db/migrations/` in sorted filename order.
 * Tracks applied filenames in the `_migrations` table. Each run is transactional:
 * all pending migrations apply inside a single BEGIN/COMMIT.
 */
export function runMigrations(): void {
  const db = getDb();

  // Schema changes (DROP parent tables, rebuild-via-copy) need FK
  // enforcement off. Also pin legacy_alter_table so RENAME doesn't rewrite
  // child FK references out from under us.
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');

  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (\n' +
      '  id         TEXT PRIMARY KEY,\n' +
      '  applied_at INTEGER NOT NULL\n' +
      ')',
  );

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedStmt = db.prepare<[], { id: string }>('SELECT id FROM _migrations');
  const applied = new Set(appliedStmt.all().map((r) => r.id));

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) return;

  const insertStmt = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  const apply = db.transaction((items: string[]) => {
    const now = Math.floor(Date.now() / 1000);
    for (const file of items) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      db.exec(sql);
      insertStmt.run(file, now);
    }
  });

  apply(pending);
}
