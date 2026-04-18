-- 0002_share_events.sql — per-share audit trail (plan §A.1, ShareEventRow)
CREATE TABLE IF NOT EXISTS share_events (
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

CREATE INDEX IF NOT EXISTS idx_share_events_share_at
  ON share_events (share_id, at DESC);
