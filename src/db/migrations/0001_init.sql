-- 0001_init.sql — initial shares table (plan §A.1, ShareRow)
CREATE TABLE IF NOT EXISTS shares (
  id                        TEXT    PRIMARY KEY,
  token_hash                TEXT    NOT NULL UNIQUE,
  plex_rating_key           TEXT    NOT NULL,
  title                     TEXT    NOT NULL,
  plex_media_type           TEXT    NOT NULL CHECK (plex_media_type IN ('movie','episode')),
  recipient_label           TEXT    NOT NULL,
  recipient_note            TEXT,
  created_at                INTEGER NOT NULL,
  expires_at                INTEGER NOT NULL,
  max_plays                 INTEGER,
  play_count                INTEGER NOT NULL DEFAULT 0,
  device_fingerprint_hash   TEXT,
  device_locked_at          INTEGER,
  revoked_at                INTEGER,
  created_by_sub            TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_created_at ON shares (created_at DESC);
