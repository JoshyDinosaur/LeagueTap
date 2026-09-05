-- ============================================================
-- LeagueTap — "The Ledger" reporter's generated stories.
-- Not tied to a real news article (news_items/blurbs), so it gets
-- its own table. One row per (league, manager, week, story type),
-- so re-running the reporter overwrites rather than duplicates.
-- Run once: SQL Editor → New query → Run. Idempotent.
-- ============================================================
create table if not exists ledger_items (
  id                    uuid primary key default gen_random_uuid(),
  league_id             text not null,
  season                text not null,
  week                  int  not null,
  roster_id             int,
  manager_name          text,
  headline              text not null,
  text                  text not null,
  category              text not null,  -- blunder | steal | streak
  points_left_on_bench  numeric,        -- ranking signal; how big the story is
  created_at            timestamptz not null default now(),
  unique (league_id, roster_id, season, week, category)
);
create index if not exists ledger_items_league_week_idx on ledger_items (league_id, week);

alter table ledger_items enable row level security;
