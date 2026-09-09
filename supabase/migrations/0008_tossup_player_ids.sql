-- Persist the two Sleeper player IDs behind a "toss_up" Ledger entry (the
-- current starter and the top bench alternative at that slot) so the app can
-- later look up the news/blurbs actually relevant to that specific decision.
-- Only ever populated for category = 'toss_up' rows; null for blunder/steal/streak.
alter table ledger_items
  add column if not exists starter_player_id text,
  add column if not exists bench_player_id   text;
