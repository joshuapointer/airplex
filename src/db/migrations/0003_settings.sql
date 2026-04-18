-- 0003_settings.sql — key/value settings used for runtime-configurable
-- values (e.g. Plex account token and server URL acquired via the PIN
-- OAuth flow in /setup/plex).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
