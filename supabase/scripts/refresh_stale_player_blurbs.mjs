#!/usr/bin/env node
// ============================================================
// LeagueTap — force-refresh news_items/blurbs affected by the
// sync-players RELEVANT_POSITIONS fix (IDPs like Josh Sweat were
// previously absent from `players`, so ingest-news could never
// tag them into player_ids, and get-league-feed/get-feed had no
// authoritative team to ground the AI writer -- it fell back on
// stale training data, e.g. calling a since-traded Josh Sweat a
// Philadelphia Eagle).
//
// This is a ONE-TIME backfill for existing rows. New ingests are
// already fixed by the sync-players change; this repairs history.
//
// What it does, per news_item (default: last 14 days):
//   1. Re-runs the exact same two-pass matcher ingest-news uses
//      (full-name always; last-name + team-in-text) against the
//      headline+body, using the now-current `players` table.
//   2. If that finds MORE player_ids than are already stored,
//      updates news_items.player_ids to the superset (never
//      removes existing ids -- purely additive/corrective).
//   3. For every news_item whose player_ids changed, deletes its
//      cached rows from `blurbs` so get-league-feed / get-feed
//      regenerate fresh (correctly grounded) blurbs on next fetch.
//
// Usage:
//   SUPABASE_URL=https://ducyqpybwyfoicylfflq.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node refresh_stale_player_blurbs.mjs [--dry-run] [--days=14]
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.split("=")[1]) : 14;

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

async function restDelete(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { ...restHeaders, Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status} ${await res.text()}`);
}

// Same normalize() as ingest-news / sync-players.
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Same TEAM_SIGNALS table as ingest-news.
const TEAM_SIGNALS = {
  ARI: ["arizona", "cardinals"], ATL: ["atlanta", "falcons"],
  BAL: ["baltimore", "ravens"], BUF: ["buffalo", "bills"],
  CAR: ["carolina", "panthers"], CHI: ["chicago", "bears"],
  CIN: ["cincinnati", "bengals"], CLE: ["cleveland", "browns"],
  DAL: ["dallas", "cowboys"], DEN: ["denver", "broncos"],
  DET: ["detroit", "lions"], GB: ["green bay", "packers"],
  HOU: ["houston", "texans"], IND: ["indianapolis", "colts"],
  JAX: ["jacksonville", "jaguars"], KC: ["kansas city", "chiefs"],
  LAC: ["chargers"], LAR: ["rams"], LV: ["las vegas", "raiders"],
  MIA: ["miami", "dolphins"], MIN: ["minnesota", "vikings"],
  NE: ["new england", "patriots"], NO: ["new orleans", "saints"],
  NYG: ["giants"], NYJ: ["jets"], PHI: ["philadelphia", "eagles"],
  PIT: ["pittsburgh", "steelers"], SEA: ["seattle", "seahawks"],
  SF: ["san francisco", "niners"], TB: ["tampa bay", "buccaneers", "bucs"],
  TEN: ["tennessee", "titans"], WAS: ["washington", "commanders"],
};

async function main() {
  if (DRY_RUN) console.log("Running in --dry-run mode: no writes will be made.\n");

  console.log("Loading players...");
  const players = await restGet(
    "players?select=sleeper_player_id,search_name,team&team=not.is.null&limit=100000"
  );
  console.log(`Loaded ${players.length} players.`);

  const fullIndex = [];
  const lastIndex = new Map();
  for (const p of players) {
    const sn = (p.search_name ?? "").trim();
    if (sn.length >= 6) fullIndex.push({ name: ` ${sn} `, id: p.sleeper_player_id });
    const last = sn.split(" ").pop() ?? "";
    if (last.length >= 4 && p.team) {
      const arr = lastIndex.get(last) ?? [];
      arr.push({ id: p.sleeper_player_id, team: p.team });
      lastIndex.set(last, arr);
    }
  }

  const matchIds = (text) => {
    const hay = ` ${normalize(text)} `;
    const teamsInText = new Set();
    for (const [abbr, sigs] of Object.entries(TEAM_SIGNALS)) {
      for (const s of sigs) { if (hay.includes(` ${s} `)) { teamsInText.add(abbr); break; } }
    }
    const out = new Set();
    for (const { name, id } of fullIndex) if (hay.includes(name)) out.add(id);
    for (const [last, cands] of lastIndex) {
      if (!hay.includes(` ${last} `)) continue;
      for (const c of cands) if (teamsInText.has(c.team)) out.add(c.id);
    }
    return out;
  };

  const since = new Date(Date.now() - DAYS * 86400 * 1000).toISOString();
  console.log(`\nLoading news_items published since ${since}...`);
  const items = await restGet(
    `news_items?select=id,headline,body,player_ids,published_at&published_at=gte.${since}&limit=100000`
  );
  console.log(`Loaded ${items.length} news_items.`);

  let changed = 0;
  const changedIds = [];
  for (const it of items) {
    const found = matchIds(`${it.headline ?? ""} ${it.body ?? ""}`);
    const existing = new Set(it.player_ids ?? []);
    const added = [...found].filter((id) => !existing.has(id));
    if (!added.length) continue;

    const merged = [...new Set([...existing, ...found])];
    changed++;
    changedIds.push(it.id);
    console.log(
      `  news_item ${it.id} "${(it.headline ?? "").slice(0, 70)}": +${added.length} player id(s) -> ${added.join(", ")}`
    );
    if (!DRY_RUN) {
      await restPatch(`news_items?id=eq.${it.id}`, { player_ids: merged });
    }
  }
  console.log(`\n${changed} news_items ${DRY_RUN ? "would be" : "were"} updated with new player_ids.`);

  if (changed && !DRY_RUN) {
    console.log(`\nBusting cached blurbs for ${changedIds.length} affected news_items...`);
    // PostgREST 'in' filter, chunked to keep URLs reasonable.
    const CHUNK = 200;
    for (let i = 0; i < changedIds.length; i += CHUNK) {
      const slice = changedIds.slice(i, i + CHUNK);
      const list = slice.map((id) => `"${id}"`).join(",");
      await restDelete(`blurbs?news_item_id=in.(${list})`);
    }
    console.log("Done -- next feed fetch will regenerate these blurbs with correct grounding.");
  } else if (changed && DRY_RUN) {
    console.log("(dry-run: blurbs would be deleted for the items above)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
