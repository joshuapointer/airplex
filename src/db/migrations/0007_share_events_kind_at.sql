CREATE INDEX IF NOT EXISTS idx_share_events_kind_at
  ON share_events (kind, at DESC);
