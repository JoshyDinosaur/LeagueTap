-- TEMPORARY diagnostic function to verify cron job state via RPC (the cron
-- schema isn't exposed over PostgREST directly). Drop after use -- see the
-- next migration.
create or replace function public.diag_list_cron_jobs()
returns table(jobname text, schedule text, active boolean)
language sql security definer as $$
  select jobname, schedule, active from cron.job order by jobname;
$$;
