-- ============================================================
-- LeagueTap — reporter persona routing.
-- Tags each news item as breaking | beat | social so get-feed can
-- write the blurb in the matching reporter's voice.
-- Run once: SQL Editor → New query → Run. Idempotent.
-- ============================================================
alter table news_items add column if not exists reporter_type text;  -- breaking | beat | social
