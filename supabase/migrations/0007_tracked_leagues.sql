-- tracked_leagues — every league the app has actually been used with. This
-- is what turns cron jobs from "one hardcoded league_id" into "every league
-- someone currently has active," so onboarding a new league or switching
-- via the league switcher is enough on its own to bring that league into
-- the polling/Ledger/toss-up pipeline -- no code or cron change needed.
--
-- Rows are upserted by the app (see track-league) any time a user loads a
-- league: onboarding, the league switcher, and cold-start session restore
-- all funnel through lib/services/league_session.dart's loadLeagueForUser,
-- which is the one place that calls track-league.
create table if not exists tracked_leagues (
  league_id text primary key,
  league_name text,
  first_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table tracked_leagues enable row level security;
