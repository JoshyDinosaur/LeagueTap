-- Drop the temporary diagnostic function from 0011 -- verification is done,
-- this was never part of the app's regular schema.
drop function if exists public.diag_list_cron_jobs();
