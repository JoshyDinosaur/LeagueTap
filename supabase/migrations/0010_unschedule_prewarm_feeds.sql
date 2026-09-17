-- Remove the leaguetap-prewarm-feeds cron job. It force-generated Haiku
-- blurbs for every tracked league every 15 minutes around the clock,
-- regardless of app usage -- the single biggest driver of runaway Anthropic
-- spend (the account hit its $25/month cap after about a week). See
-- get-league-feed/index.ts: it now generates on-demand instead, the first
-- time a league's tab is actually opened after fresh news, and its Haiku
-- call is also de-duplicated across leagues that share a rostered player.
-- Idempotent: unschedule() is a no-op if the job is already gone.
select cron.unschedule('leaguetap-prewarm-feeds')
where exists (select 1 from cron.job where jobname = 'leaguetap-prewarm-feeds');
