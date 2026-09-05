-- ============================================================
-- LeagueTap — scheduled jobs (pg_cron + pg_net)
-- Run once in Supabase: SQL Editor → New query → Run.
-- Keeps news/players fresh and the LeagueTap home cache warm,
-- entirely server-side (no machine needs to be on).
--
-- Multi-league: every job below calls its function with an EMPTY body.
-- Each function fans out internally across every row in tracked_leagues --
-- every league someone has actually loaded in the app (onboarding, the
-- league switcher, or cold-start restore all ping track-league via
-- lib/services/league_session.dart). Adding or switching leagues in the
-- app is enough on its own to bring that league into every job below; no
-- cron edit or redeploy needed. (ingest-news and sync-players are
-- league-agnostic and unaffected by any of this.)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper note: pg_cron schedules are in UTC.
-- net.http_post returns immediately; the function runs async.

-- 1) Ingest news every 15 minutes (on the quarter hours).
select cron.schedule(
  'leaguetap-ingest-news',
  '0,15,30,45 * * * *',
  $$
  select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ingest-news',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2) Refresh the NFL player map once daily (09:00 UTC).
select cron.schedule(
  'leaguetap-sync-players',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/sync-players',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3) Pre-warm the LeagueTap home feed ~5 min after each ingest, so the
--    league blurbs are cached before anyone opens the app. prewarm-feeds
--    loops every tracked league itself -- one job covers all of them.
select cron.schedule(
  'leaguetap-prewarm-feeds',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/prewarm-feeds',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);


-- 4) Poll lineups (starters + bench + live points) every 5 minutes for
--    ~1.5-2 hours after each game window typically wraps, so "Who's Starting"
--    feels alive as real scores land, without guessing an exact end time.
--    Cheap: each call is just a Sleeper fetch + a small upsert per tracked
--    league, no AI cost. Windows are approximate on purpose -- Sleeper's own
--    points update live, so an extra poll before/after a window just means a
--    slightly-early or slightly-late refresh, never wrong data. final=true is
--    set separately, once, well after Monday Night Football (see job 5 below).

-- Thursday Night Football (~11pm-12:45am ET)
select cron.schedule(
  'leaguetap-poll-thu', '0,5,10,15,20,25,30,35,40,45,50,55 3,4 * * 5',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Sunday early window (~4:15-6pm ET)
select cron.schedule(
  'leaguetap-poll-sun-early', '0,5,10,15,20,25,30,35,40,45,50,55 20,21 * * 0',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Sunday late window (~7:15-9pm ET) -- spans the UTC day boundary, so it's
-- two schedule entries covering the same continuous window.
select cron.schedule(
  'leaguetap-poll-sun-late-a', '0,5,10,15,20,25,30,35,40,45,50,55 23 * * 0',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
select cron.schedule(
  'leaguetap-poll-sun-late-b', '0,5,10,15,20,25,30,35,40,45,50,55 0 * * 1',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Sunday Night Football (~11pm-12:45am ET)
select cron.schedule(
  'leaguetap-poll-snf', '0,5,10,15,20,25,30,35,40,45,50,55 3,4 * * 1',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- Monday Night Football (~11pm-12:45am ET) -- still final=false; the
-- authoritative final=true snapshot is job 5 below, well after this window.
select cron.schedule(
  'leaguetap-poll-mnf', '0,5,10,15,20,25,30,35,40,45,50,55 3,4 * * 2',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- 5) Final, authoritative snapshot for the week -- comfortably after the MNF
--    poll window ends (2am ET during standard time, 3am ET during daylight
--    time), so it never marks a week final before the games are actually over.
select cron.schedule(
  'leaguetap-snapshot-final', '0 6 * * 2',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/snapshot-lineups',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{"final":true}'::jsonb
  ); $$
);

-- 6) The Ledger writes up each window once, shortly after its polling ends --
--    not every 5 minutes. Its Anthropic calls cost real money per candidate
--    per tracked league, so it's pinned to specific days (not "every day at
--    this hour") so it doesn't re-invoke Haiku on stale data every day the
--    week has no new game.
select cron.schedule(
  'leaguetap-ledger-thu', '0 5 * * 5',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
select cron.schedule(
  'leaguetap-ledger-sun-early', '0 22 * * 0',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
select cron.schedule(
  'leaguetap-ledger-sun-late', '0 1 * * 1',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
select cron.schedule(
  'leaguetap-ledger-snf', '0 5 * * 1',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
select cron.schedule(
  'leaguetap-ledger-final', '0 7 * * 2',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- 7) The Ledger's "toss-up" preview -- decisions still to be made, not yet
--    graded. Runs before lock, not on a live-polling cadence: it also calls
--    Haiku per candidate per tracked league, same cost profile as job 6.
--    Wednesday (lineups mostly set for the week) and Sunday morning (before
--    early games lock, catching last-minute lineup changes).
select cron.schedule(
  'leaguetap-tossup-wed', '0 15 * * 3',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-tossup',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
select cron.schedule(
  'leaguetap-tossup-sun', '0 16 * * 0',
  $$ select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/ledger-tossup',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);


-- ---- Inspect / manage ----
-- select * from cron.job;                          -- list jobs
-- select * from cron.job_run_details               -- recent runs
--   order by start_time desc limit 20;
-- select cron.unschedule('leaguetap-ingest-news'); -- remove a job
-- select * from tracked_leagues;                   -- which leagues are live
