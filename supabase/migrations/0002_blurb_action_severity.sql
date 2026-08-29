-- ============================================================
-- LeagueTap — add structured fields to cached blurbs.
-- Run once against the live DB: SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
-- ============================================================
alter table blurbs add column if not exists action   text;  -- Start/Sit/Add/Drop/Hold/Stash/Trade/Monitor
alter table blurbs add column if not exists severity text;  -- high | medium | low
