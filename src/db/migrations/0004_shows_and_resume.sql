-- 0004_shows_and_resume.sql
--
-- 1. Expand plex_media_type CHECK constraint to include 'show' so an admin
--    can share a whole series and let the recipient browse seasons/episodes.
--    SQLite has no ALTER TABLE ... DROP CONSTRAINT, so the shares table is
--    rebuilt.
-- 2. Add resume_positions keyed by (share_id, rating_key) to persist
--    playback position across visits. rating_key is separate from
--    shares.plex_rating_key so a show share tracks per-episode progress.

-- ---- 1. Shares rebuild -----------------------------------------------------
ALTER TABLE shares RENAME TO shares_0004_old;

CREATE TABLE shares (
  id                        TEXT    PRIMARY KEY,
  token_hash                TEXT    NOT NULL UNIQUE,
  plex_rating_key           TEXT    NOT NULL,
  title                     TEXT    NOT NULL,
  plex_media_type           TEXT    NOT NULL CHECK (plex_media_type IN ('movie','episode','show')),
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

INSERT INTO shares (
  id, token_hash, plex_rating_key, title, plex_media_type,
  recipient_label, recipient_note, created_at, expires_at, max_plays,
  play_count, device_fingerprint_hash, device_locked_at, revoked_at,
  created_by_sub
)
SELECT
  id, token_hash, plex_rating_key, title, plex_media_type,
  recipient_label, recipient_note, created_at, expires_at, max_plays,
  play_count, device_fingerprint_hash, device_locked_at, revoked_at,
  created_by_sub
FROM shares_0004_old;

DROP TABLE shares_0004_old;

CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_created_at ON shares (created_at DESC);

-- ---- 2. resume_positions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS resume_positions (
  share_id    TEXT    NOT NULL,
  rating_key  TEXT    NOT NULL,
  position_ms INTEGER NOT NULL,
  duration_ms INTEGER,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (share_id, rating_key),
  FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resume_share ON resume_positions (share_id);
