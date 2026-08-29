-- ============================================================
-- LeagueTap — v1 database schema (Postgres / Supabase)
-- Paste into Supabase: SQL Editor → New query → Run.
-- ============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ============================================================
-- players: NFL player map, refreshed daily from Sleeper
--   GET /v1/players/nfl  (cache once per day, never per request)
-- ============================================================
create table if not exists players (
  sleeper_player_id    text primary key,
  full_name            text not null,
  search_name          text,                 -- normalized lowercase for matching
  aliases              text[] default '{}',  -- nickname/alt-spelling matches
  team                 text,
  position             text,
  injury_status        text,                 -- Questionable/Doubtful/Out/IR/PUP/null
  depth_chart_order    int,                  -- 1 = starter at the spot
  depth_chart_position text,                 -- RB, WR, SLOT, …
  age                  int,
  years_exp            int,                  -- 0 = rookie
  status               text,                 -- Active/Inactive/…
  number               int,                  -- jersey number
  updated_at           timestamptz default now()
);
create index if not exists players_search_name_idx on players (search_name);
create index if not exists players_team_idx on players (team);

-- ============================================================
-- users: a LeagueTap user, linked to a Sleeper account
-- ============================================================
create table if not exists users (
  id               uuid primary key default gen_random_uuid(),
  sleeper_username text,
  sleeper_user_id  text,
  active_league_id text,                  -- the league they're currently viewing
  created_at       timestamptz default now()
);
create index if not exists users_sleeper_user_id_idx on users (sleeper_user_id);

-- ============================================================
-- leagues: a Sleeper league (id IS the Sleeper league_id)
-- ============================================================
create table if not exists leagues (
  id                text primary key,     -- sleeper league_id
  season            text,
  name              text,
  scoring_settings  jsonb,                -- raw Sleeper scoring_settings
  updated_at        timestamptz default now()
);

-- ============================================================
-- rosters: one row per team in a league
-- ============================================================
create table if not exists rosters (
  league_id         text references leagues(id) on delete cascade,
  sleeper_roster_id int  not null,
  owner_user_id     text,                 -- sleeper user_id of the owner
  player_ids        text[] default '{}',  -- sleeper_player_ids on this roster
  updated_at        timestamptz default now(),
  primary key (league_id, sleeper_roster_id)
);
-- GIN index makes "does this news item hit my roster?" fast
create index if not exists rosters_player_ids_idx on rosters using gin (player_ids);

-- ============================================================
-- news_items: ingested NFL news, tagged to players
-- ============================================================
create table if not exists news_items (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  url          text unique not null,      -- dedupe key
  headline     text not null,
  body         text,
  published_at timestamptz,
  player_ids    text[] default '{}',      -- tagged via name matching (rules half)
  impact_score  numeric default 0,        -- ranking signal
  reporter_type text,                     -- breaking | beat | social (persona routing)
  created_at    timestamptz default now()
);
alter table news_items add column if not exists reporter_type text;
create index if not exists news_items_player_ids_idx on news_items using gin (player_ids);
create index if not exists news_items_published_at_idx on news_items (published_at desc);

-- ============================================================
-- blurbs: cached AI "what this means for your team" text
--   keyed by (news item + roster context) so it's generated once
-- ============================================================
create table if not exists blurbs (
  news_item_id        uuid references news_items(id) on delete cascade,
  roster_context_key  text not null,      -- e.g. hash of relevant roster slot/role
  text                text not null,
  action              text,               -- Start/Sit/Add/Drop/Hold/Stash/Buy Low/…
  severity            text,               -- high | medium | low
  confidence          text,               -- high | medium | low
  timeframe           text,               -- now | this_week | rest_of_season | dynasty
  relevance           int,                -- 0–100 signal score
  reasoning           text,               -- short "why"
  tags                text[],             -- opportunity, risk, volume, role_change, …
  model               text,
  created_at          timestamptz default now(),
  primary key (news_item_id, roster_context_key)
);
-- For existing databases (table already created without these columns):
alter table blurbs add column if not exists action     text;
alter table blurbs add column if not exists severity   text;
alter table blurbs add column if not exists confidence text;
alter table blurbs add column if not exists timeframe  text;
alter table blurbs add column if not exists relevance  int;
alter table blurbs add column if not exists reasoning  text;
alter table blurbs add column if not exists tags       text[];

-- ============================================================
-- Row Level Security
--   Beta approach: Edge Functions use the service_role key and
--   bypass RLS. Enable RLS so nothing is publicly writable by
--   the anon key. Add granular read policies later if the client
--   ever reads tables directly.
-- ============================================================
alter table players    enable row level security;
alter table users      enable row level security;
alter table leagues    enable row level security;
alter table rosters    enable row level security;
alter table news_items enable row level security;
alter table blurbs     enable row level security;
