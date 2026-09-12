-- Persist the starter-vs-bench raw stat comparison behind a blunder/steal
-- Ledger entry (position-relevant box-score stats -- yards, TDs, receptions,
-- etc. -- never fantasy point totals), so the card's detail page can render
-- a grid instead of just a headline/text writeup. Computed once by
-- ledger-report at write time; null for streak rows and for entries
-- generated before this column existed.
-- Shape: { starter: {id, name, position, stats: [{key,label,value}]},
--          bench:   {id, name, position, stats: [{key,label,value}]} }
alter table ledger_items
  add column if not exists stat_comparison jsonb;
