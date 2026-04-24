-- 0008_nullable_expires_at.sql
--
-- Support shares that never expire. SQLite has no ALTER TABLE ... DROP NOT
-- NULL, so rebuild the shares table. NULL expires_at means "no expiry" —
-- computeShareStatus treats it as not-expired; admin UI surfaces a "Never
-- expires" toggle; recipient screen hides the TTL line.

ALTER TABLE shares RENAME TO shares_0008_old;

CREATE TABLE shares (
  id                        TEXT    PRIMARY KEY,
  token_hash                TEXT    NOT NULL UNIQUE,
  plex_rating_key           TEXT    NOT NULL,
  title                     TEXT    NOT NULL,
  plex_media_type           TEXT    NOT NULL CHECK (plex_media_type IN ('movie','episode','show')),
  recipient_label           TEXT    NOT NULL,
  recipient_note            TEXT,
  sender_label              TEXT,
  poster_path               TEXT,
  created_at                INTEGER NOT NULL,
  expires_at                INTEGER,
  max_plays                 INTEGER,
  play_count                INTEGER NOT NULL DEFAULT 0,
  device_fingerprint_hash   TEXT,
  device_locked_at          INTEGER,
  revoked_at                INTEGER,
  created_by_sub            TEXT    NOT NULL
);

INSERT INTO shares (
  id, token_hash, plex_rating_key, title, plex_media_type,
  recipient_label, recipient_note, sender_label, poster_path,
  created_at, expires_at, max_plays,
  play_count, device_fingerprint_hash, device_locked_at, revoked_at,
  created_by_sub
)
SELECT
  id, token_hash, plex_rating_key, title, plex_media_type,
  recipient_label, recipient_note, sender_label, poster_path,
  created_at, expires_at, max_plays,
  play_count, device_fingerprint_hash, device_locked_at, revoked_at,
  created_by_sub
FROM shares_0008_old;

DROP TABLE shares_0008_old;

CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_created_at ON shares (created_at DESC);
