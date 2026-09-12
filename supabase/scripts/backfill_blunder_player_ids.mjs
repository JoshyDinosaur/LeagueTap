#!/usr/bin/env node
// ============================================================
// LeagueTap — backfill starter_player_id/bench_player_id onto
// EXISTING "blunder" ledger_items rows (written before ledger-report
// started persisting them).
//
// Unlike the toss_up backfill (which had to fuzzy-match player names
// out of generated prose), a blunder's two players are exactly
// reproducible: ledger-report defines a blunder as "worst-scoring
// starter" vs "best-scoring bench player" for that (league, roster,
// week) -- the same weekly_lineups snapshot it read when it first
// wrote the row. So this recomputes that same pair directly from
// starters/bench, no text matching involved, and only skips a row
// when the snapshot itself is missing or empty.
//
// Usage:
//   SUPABASE_URL=https://ducyqpybwyfoicylfflq.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node backfill_blunder_player_ids.mjs [--dry-run]
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script."
  );
  process.exit(1);
}

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function restPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...restHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status} ${await res.text()}`);
}

function worst(list) {
  return list.reduce((w, p) => (!w || p.points < w.points ? p : w), null);
}
function best(list) {
  return list.reduce((b, p) => (!b || p.points > b.points ? p : b), null);
}

async function main() {
  if (DRY_RUN) console.log("Running in --dry-run mode: no writes will be made.\n");

  console.log("Loading blunder ledger_items missing player ids...");
  const rows = await restGet(
    "ledger_items?select=id,league_id,roster_id,season,week,headline" +
    "&category=eq.blunder&starter_player_id=is.null&limit=10000"
  );
  console.log(`Found ${rows.length} blunder row(s) missing ids.\n`);

  let fixed = 0;
  let skipped = 0;

  for (const row of rows) {
    const label = `ledger_item ${row.id} (wk ${row.week}, roster ${row.roster_id})`;

    const snapshots = await restGet(
      `weekly_lineups?select=starters,bench` +
      `&league_id=eq.${row.league_id}&roster_id=eq.${row.roster_id}` +
      `&season=eq.${row.season}&week=eq.${row.week}&limit=1`
    );
    const snap = snapshots[0];
    if (!snap) {
      console.log(`  SKIP ${label}: no weekly_lineups snapshot for that week.`);
      skipped++;
      continue;
    }

    const starters = Array.isArray(snap.starters) ? snap.starters : [];
    const bench = Array.isArray(snap.bench) ? snap.bench : [];
    const worstStarter = worst(starters);
    const bestBench = best(bench);

    if (!worstStarter?.player_id || !bestBench?.player_id) {
      console.log(
        `  SKIP ${label}: incomplete snapshot (starters:${starters.length}, bench:${bench.length}) ` +
        `-- "${(row.headline ?? "").slice(0, 60)}"`
      );
      skipped++;
      continue;
    }

    const starterPlayerId = String(worstStarter.player_id);
    const benchPlayerId = String(bestBench.player_id);
    console.log(
      `  FIX  ${label}: starter=${worstStarter.name} (${starterPlayerId}), ` +
      `bench=${bestBench.name} (${benchPlayerId})`
    );
    fixed++;
    if (!DRY_RUN) {
      await restPatch(`ledger_items?id=eq.${row.id}`, {
        starter_player_id: starterPlayerId,
        bench_player_id: benchPlayerId,
      });
    }
  }

  console.log(`\n${fixed} row(s) ${DRY_RUN ? "would be" : "were"} fixed. ${skipped} skipped (see above).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
