-- 0005_fix_share_events_fk.sql
--
-- 0004 used RENAME TABLE shares → shares_0004_old, which — in SQLite's
-- default "non-legacy" ALTER TABLE mode — rewrites FK references in child
-- tables to follow the rename. share_events's FK was redirected to
-- shares_0004_old, which was then dropped, leaving a dangling FK that
-- breaks every SELECT through the join path once foreign_keys=ON.
--
-- Rebuild share_events with the correct FK.

CREATE TABLE share_events_0005_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id   TEXT    NOT NULL,
  at         INTEGER NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN (
              'created','claimed','play','rejected_device','expired','revoked','reset'
             )),
  ip_hash    TEXT,
  ua_hash    TEXT,
  detail     TEXT,
  FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
);

INSERT INTO share_events_0005_new (id, share_id, at, kind, ip_hash, ua_hash, detail)
SELECT id, share_id, at, kind, ip_hash, ua_hash, detail FROM share_events;

DROP TABLE share_events;

ALTER TABLE share_events_0005_new RENAME TO share_events;

CREATE INDEX IF NOT EXISTS idx_share_events_share_at
  ON share_events (share_id, at DESC);
