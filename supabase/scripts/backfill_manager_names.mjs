#!/usr/bin/env node
// ============================================================
// LeagueTap — backfill manager_name to Sleeper usernames.
//
// The manager_name column in weekly_lineups and ledger_items is
// written once by the snapshot-lineups / ledger-tossup Edge
// Functions and never re-derived afterward. Rows created before
// those functions were fixed to prefer username over
// metadata.team_name / display_name are stuck with the old value
// forever unless corrected here. New rows going forward are fine
// on their own -- this script is a one-time (or occasional) sweep
// over EXISTING rows.
//
// Usage:
//   SUPABASE_URL=https://ducyqpybwyfoicylfflq.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node backfill_manager_names.mjs [--dry-run]
//
// Requires the service role key (Project Settings -> API in the
// Supabase dashboard) because it needs to write past RLS. Never
// commit that key or paste it into a shell history you share.
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
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function restPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...restHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${path} failed: ${res.status} ${await res.text()}`);
  }
}

async function sleeperGet(path) {
  const res = await fetch(`https://api.sleeper.app/v1/${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

// Build { roster_id -> username } for one league, straight from
// Sleeper (rosters give owner_id per roster_id, users give username
// per user_id).
async function buildRosterUsernameMap(leagueId) {
  const [rosters, users] = await Promise.all([
    sleeperGet(`league/${leagueId}/rosters`),
    sleeperGet(`league/${leagueId}/users`),
  ]);

  const usernameByUserId = new Map();
  for (const u of users) {
    const username = (u.username || "").toString().trim();
    const displayName = (u.display_name || "").toString().trim();
    usernameByUserId.set(u.user_id, username || displayName || null);
  }

  const usernameByRosterId = new Map();
  for (const r of rosters) {
    if (r.owner_id == null) continue;
    const name = usernameByUserId.get(r.owner_id);
    if (name) usernameByRosterId.set(r.roster_id, name);
  }
  return usernameByRosterId;
}

async function backfillTable(table) {
  console.log(`\n--- ${table} ---`);
  const rows = await restGet(`${table}?select=id,league_id,roster_id,manager_name&limit=100000`);
  console.log(`Fetched ${rows.length} rows.`);

  const leagueIds = [...new Set(rows.map((r) => r.league_id))];
  console.log(`Covers ${leagueIds.length} league(s).`);

  const mapByLeague = new Map();
  for (const leagueId of leagueIds) {
    try {
      mapByLeague.set(leagueId, await buildRosterUsernameMap(leagueId));
    } catch (err) {
      console.warn(`  Skipping league ${leagueId}: ${err.message}`);
      mapByLeague.set(leagueId, new Map());
    }
  }

  let updated = 0;
  let unchanged = 0;
  let noMatch = 0;

  for (const row of rows) {
    const rosterMap = mapByLeague.get(row.league_id);
    const correctName = rosterMap?.get(row.roster_id);
    if (!correctName) {
      noMatch++;
      continue;
    }
    if (row.manager_name === correctName) {
      unchanged++;
      continue;
    }
    updated++;
    console.log(
      `  ${table} id=${row.id} league=${row.league_id} roster=${row.roster_id}: "${row.manager_name}" -> "${correctName}"`
    );
    if (!DRY_RUN) {
      await restPatch(`${table}?id=eq.${row.id}`, { manager_name: correctName });
    }
  }

  console.log(
    `${table}: ${updated} ${DRY_RUN ? "would update" : "updated"}, ${unchanged} already correct, ${noMatch} had no Sleeper match.`
  );
}

async function main() {
  if (DRY_RUN) console.log("Running in --dry-run mode: no writes will be made.\n");
  await backfillTable("weekly_lineups");
  await backfillTable("ledger_items");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
