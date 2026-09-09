#!/usr/bin/env node
// ============================================================
// LeagueTap — backfill starter_player_id/bench_player_id onto
// EXISTING toss_up ledger_items rows (written before migration
// 0008 + the ledger-tossup change that started persisting them).
//
// Without the two ids, a toss-up card has no way to open the new
// "why this toss-up + this manager's record" detail page -- this
// is a one-time repair so older cards get the tap mechanic too.
//
// Approach: each toss_up row's headline/text already NAMES both
// players (ledger-tossup's prompt requires it). Rather than
// re-deriving that week's projections (which we may not be able to
// reconstruct exactly), match those names against the ACTUAL
// weekly_lineups snapshot for that (league_id, roster_id, week) --
// a small, safe, roster-scoped candidate pool (starters + bench,
// each already carrying the correct player_id), not a full-league
// name search. Exactly one match must land in `starters` (that's
// starter_player_id) and exactly one in `bench` (bench_player_id);
// anything else is skipped and logged for manual review rather
// than guessed at.
//
// Usage:
//   SUPABASE_URL=https://ducyqpybwyfoicylfflq.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node backfill_tossup_player_ids.mjs [--dry-run]
// ==========================================================

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

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  if (DRY_RUN) console.log("Running in --dry-run mode: no writes will be made.\n");

  console.log("Loading toss_up ledger_items missing player ids...");
  const rows = await restGet(
    "ledger_items?select=id,league_id,roster_id,season,week,headline,text" +
    "&category=eq.toss_up&starter_player_id=is.null&limit=10000"
  );
  console.log(`Found ${rows.length} toss_up row(s) missing ids.\n`);

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
    const haystack = ` ${normalize(`${row.headline ?? ""} ${row.text ?? ""}`)} `;

    const matchSide = (list) =>
      list.filter((p) => p?.name && p?.player_id && haystack.includes(` ${normalize(p.name)} `));

    const starterMatches = matchSide(starters);
    const benchMatches = matchSide(bench);

    if (starterMatches.length !== 1 || benchMatches.length !== 1) {
      console.log(
        `  SKIP ${label}: ambiguous match (starters:${starterMatches.length}, bench:${benchMatches.length}) ` +
        `-- "${(row.headline ?? "").slice(0, 60)}"`
      );
      skipped++;
      continue;
    }

    const starterPlayerId = String(starterMatches[0].player_id);
    const benchPlayerId = String(benchMatches[0].player_id);
    console.log(
      `  FIX  ${label}: starter=${starterMatches[0].name} (${starterPlayerId}), ` +
      `bench=${benchMatches[0].name} (${benchPlayerId})`
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
