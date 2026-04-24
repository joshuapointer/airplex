-- 0006_sender_label_and_poster.sql
--
-- 1. sender_label — optional "From X" shown to the recipient on the
--    unclaimed share screen. NULLable so existing rows remain valid.
-- 2. poster_path — snapshot of the Plex `thumb` URI captured at share
--    creation. Lets the recipient see a poster even if Plex is unreachable
--    at view time. NULLable because (a) existing rows predate this column
--    and (b) share-create may legitimately fail to fetch metadata.

ALTER TABLE shares ADD COLUMN sender_label TEXT;
ALTER TABLE shares ADD COLUMN poster_path TEXT;
