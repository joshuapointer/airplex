#!/usr/bin/env node
/**
 * Runtime migration runner used by docker/entrypoint.sh. Pure CJS, no tsx
 * needed. Reads DATABASE_URL + NODE_ENV from the environment and applies
 * every .sql file in src/db/migrations/ in sorted order, tracked in the
 * _migrations table.
 *
 * This is intentionally a copy of the logic in src/db/migrate.ts (not an
 * import) so it works in the standalone runtime image where the TS source
 * isn't transpiled to plain JS on the runtime side.
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const url = process.env.DATABASE_URL || '';
if (!url.startsWith('file:')) {
  console.error('[migrate] DATABASE_URL must start with "file:" — got', JSON.stringify(url));
  process.exit(1);
}
const raw = url.slice('file:'.length);
const dbPath = raw === ':memory:' ? ':memory:' : raw;

if (dbPath !== ':memory:') {
  const parent = path.dirname(dbPath);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
// Deliberately leave foreign_keys OFF during migrations so schema
// reshuffles (DROP parent tables, rename-via-copy) don't trip the FK
// guard. The application (src/db/client.ts) re-enables foreign_keys=ON
// for the normal request path.
db.pragma('foreign_keys = OFF');
db.pragma('legacy_alter_table = ON');
db.pragma('synchronous = NORMAL');

db.exec(
  'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
);

const dir = path.resolve(process.cwd(), 'src/db/migrations');
if (!fs.existsSync(dir)) {
  console.error('[migrate] migrations dir not found at', dir);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const applied = new Set(db.prepare('SELECT id FROM _migrations').all().map((r) => r.id));
const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log('[migrate] up to date (' + files.length + ' migrations)');
  process.exit(0);
}

const insert = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');
const apply = db.transaction((items) => {
  const ts = Math.floor(Date.now() / 1000);
  for (const f of items) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec(sql);
    insert.run(f, ts);
  }
});

apply(pending);
console.log('[migrate] applied:', pending.join(', '));
