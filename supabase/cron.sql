-- ============================================================
-- LeagueTap — scheduled jobs (pg_cron + pg_net)
-- Run once in Supabase: SQL Editor → New query → Run.
-- Keeps news/players fresh and the LeagueTap home cache warm,
-- entirely server-side (no machine needs to be on).
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
--    league blurbs are cached before anyone opens the app.
--    (Add one job per active league_id.)
select cron.schedule(
  'leaguetap-prewarm-degenerate-dynasty',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url := 'https://ducyqpybwyfoicylfflq.supabase.co/functions/v1/get-league-feed',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_08sa51Ur1UDfT9iuauYpWw_WSU3uRq0"}'::jsonb,
    body := '{"league_id":"1327687617646444544"}'::jsonb
  );
  $$
);

-- ---- Inspect / manage ----
-- select * from cron.job;                          -- list jobs
-- select * from cron.job_run_details               -- recent runs
--   order by start_time desc limit 20;
-- select cron.unschedule('leaguetap-ingest-news'); -- remove a job
