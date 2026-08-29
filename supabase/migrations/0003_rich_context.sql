-- ============================================================
-- LeagueTap — rich context for high-signal blurb curation.
-- Run once against the live DB: SQL Editor → New query → Run.
-- Safe to re-run (idempotent). Run BEFORE deploying the updated
-- sync-players and get-feed functions.
-- ============================================================

-- ---- players: per-player fantasy context pulled from Sleeper ----
alter table players add column if not exists injury_status        text;   -- Questionable / Doubtful / Out / IR / PUP / null
alter table players add column if not exists depth_chart_order     int;    -- 1 = starter at the spot, 2 = backup, …
alter table players add column if not exists depth_chart_position  text;   -- e.g. RB, WR, LWR, SLOT
alter table players add column if not exists age                   int;
alter table players add column if not exists years_exp             int;    -- 0 = rookie
alter table players add column if not exists status                text;   -- Active / Inactive / etc.
alter table players add column if not exists number                int;    -- jersey number

-- ---- blurbs: richer structured output for curation/filtering ----
alter table blurbs add column if not exists confidence text;    -- high | medium | low
alter table blurbs add column if not exists timeframe  text;    -- now | this_week | rest_of_season | dynasty
alter table blurbs add column if not exists relevance  int;     -- 0–100 signal score for ranking/filtering
alter table blurbs add column if not exists reasoning  text;    -- short "why" behind the take
alter table blurbs add column if not exists tags       text[];  -- opportunity, risk, volume, role_change, …
