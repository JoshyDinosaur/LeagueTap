-- ============================================================
-- LeagueTap — weekly lineup history (starters + bench + points).
-- Foundation for "The Ledger" reporter: who started whom, who got
-- benched, and how each call actually turned out.
-- Populated by the snapshot-lineups Edge Function, run several
-- times per week via cron (see cron.sql) as each game window
-- finishes, with a final authoritative snapshot after MNF.
-- Run once: SQL Editor → New query → Run. Idempotent.
-- ============================================================
create table if not exists weekly_lineups (
  id                uuid primary key default gen_random_uuid(),
  league_id         text not null,
  roster_id         int  not null,
  season            text not null,
  week              int  not null,
  manager_name      text,
  starters          jsonb not null default '[]'::jsonb,  -- [{player_id, name, position, points}]
  bench             jsonb not null default '[]'::jsonb,  -- same shape, unstarted players
  starter_points    numeric,       -- sum of starters' points
  best_bench_points numeric,       -- highest-scoring bench player's points
  best_bench_player text,          -- that player's name, for quick display
  is_final          boolean not null default false,  -- true once captured post-MNF
  captured_at       timestamptz not null default now(),
  unique (league_id, roster_id, season, week)
);
create index if not exists weekly_lineups_league_week_idx on weekly_lineups (league_id, week);

alter table weekly_lineups enable row level security;
