// snapshot-lineups — captures one league's current-week starters, bench,
// each player's points-so-far, their raw box-score stats, and (for
// starters) the roster slot they were started in, so "The Ledger" reporter
// has real history to judge start/sit calls against: real stat categories
// (yards, TDs, receptions) to point at instead of just point totals, and
// enough slot info to only compare a starter against bench alternatives who
// could actually have filled that slot (same position, or any FLEX-eligible
// position for a flex slot).
//
// Run several times per week via cron as each game window wraps (Thu night,
// Sun windows, Sun night, Mon night); the final call of the week passes
// { final: true } once MNF is over, marking the week's numbers authoritative.
// Each call simply overwrites the row for that (league, roster, week) --
// Sleeper's own matchup points update live through the week, so there's no
// need to reconstruct deltas ourselves.
//
// Multi-league: cron calls this with no league_id, and it fans out across
// every row in tracked_leagues (every league someone has actually loaded in
// the app -- see track-league) instead of one hardcoded league. Passing an
// explicit { league_id } still works, for manual testing against one league.
//
// Input (POST JSON): { "league_id"?: "...", "final"?: boolean }
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PlayerLine = {
  player_id: string;
  name: string;
  position: string | null;
  points: number;
  stats: Record<string, number> | null;
  // The roster slot actually started in (RB, WR, FLEX, ...) -- only set for
  // starters, so ledger-report can compare against position-eligible bench
  // alternatives instead of the whole bench regardless of position.
  slot?: string | null;
};
type Supabase = ReturnType<typeof createClient>;

async function snapshotLeague(supabase: Supabase, leagueId: string, isFinal: boolean) {
  const [stateRes, leagueRes, rostersRes, usersRes] = await Promise.all([
    fetch("https://api.sleeper.app/v1/state/nfl"),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  if (!stateRes.ok || !leagueRes.ok || !rostersRes.ok || !usersRes.ok) {
    return { league_id: leagueId, error: "sleeper fetch failed" };
  }
  const state = await stateRes.json();
  const season = String(state.season ?? new Date().getFullYear());
  const week = Number(state.week) > 0 ? Number(state.week) : 1;
  const league = await leagueRes.json();
  // Sleeper's matchup `starters` array order matches roster_positions order
  // (minus BN) -- same assumption ledger-tossup already relies on for
  // pre-game slot detection.
  const nonBenchSlots: string[] = (league.roster_positions ?? []).filter((p: string) => p !== "BN");
  const rosters = await rostersRes.json() as any[];
  const users = await usersRes.json() as any[];

  // Raw box-score stats (yards, TDs, receptions, etc.) for The Ledger's
  // blunder/steal write-ups to point at -- best-effort, same pattern as the
  // projections fetch in ledger-tossup. Missing entirely just means no
  // stat_comparison gets computed downstream (fail-quiet).
  const statsById: Record<string, Record<string, number>> = {};
  try {
    const statsRes = await fetch(
      `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular`,
    );
    if (statsRes.ok) {
      const rows = await statsRes.json() as any[];
      for (const r of rows ?? []) {
        if (r?.player_id && r?.stats) statsById[String(r.player_id)] = r.stats;
      }
    }
  } catch (_) { /* best-effort */ }

  const nameByUser: Record<string, string> = {};
  for (const u of users) {
    nameByUser[u.user_id] = u.username || u.display_name || "A team";
  }

  const matchupsRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
  const matchups = matchupsRes.ok ? await matchupsRes.json() as any[] : [];
  if (matchups.length === 0) {
    return { league_id: leagueId, ok: true, skipped: "no matchups" };
  }

  const allIds = new Set<string>();
  for (const m of matchups) {
    for (const id of (m.players ?? [])) allIds.add(String(id));
    for (const id of (m.starters ?? [])) allIds.add(String(id));
  }
  const { data: playerRows } = await supabase
    .from("players")
    .select("sleeper_player_id, full_name, position")
    .in("sleeper_player_id", Array.from(allIds));
  const playerById: Record<string, { name: string; position: string | null }> = {};
  for (const p of playerRows ?? []) {
    playerById[p.sleeper_player_id] = { name: p.full_name, position: p.position };
  }

  const rows = matchups.map((m) => {
    const roster = rosters.find((r) => r.roster_id === m.roster_id);
    const pointsById: Record<string, number> = m.players_points ?? {};
    const starterIds: string[] = (m.starters ?? []).map(String);
    const allPlayerIds: string[] = (m.players ?? []).map(String);
    const benchIds = allPlayerIds.filter((id) => !starterIds.includes(id));

    const line = (id: string, slot: string | null = null): PlayerLine => ({
      player_id: id,
      name: playerById[id]?.name ?? "Unknown",
      position: playerById[id]?.position ?? null,
      points: Number(pointsById[id] ?? 0),
      stats: statsById[id] ?? null,
      slot,
    });

    const starters = starterIds.map((id, idx) => line(id, nonBenchSlots[idx] ?? playerById[id]?.position ?? null));
    const bench = benchIds.map((id) => line(id));
    const starterPoints = starters.reduce((sum, p) => sum + p.points, 0);
    const bestBench = bench.reduce(
      (best: PlayerLine | null, p) => (!best || p.points > best.points ? p : best),
      null,
    );

    return {
      league_id: leagueId,
      roster_id: m.roster_id,
      season,
      week,
      manager_name: roster?.owner_id ? (nameByUser[roster.owner_id] ?? null) : null,
      starters,
      bench,
      starter_points: starterPoints,
      best_bench_points: bestBench?.points ?? null,
      best_bench_player: bestBench?.name ?? null,
      is_final: isFinal,
      captured_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("weekly_lineups")
    .upsert(rows, { onConflict: "league_id,roster_id,season,week" });
  if (error) return { league_id: leagueId, error: error.message };

  return { league_id: leagueId, ok: true, week, is_final: isFinal, teams: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let leagueId = "";
  let isFinal = false;
  try {
    const body = await req.json();
    leagueId = String(body.league_id ?? "");
    isFinal = body.final === true;
  } catch (_) { /* ignore */ }

  let leagueIds: string[];
  if (leagueId) {
    leagueIds = [leagueId];
  } else {
    const { data, error } = await supabase.from("tracked_leagues").select("league_id");
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    leagueIds = (data ?? []).map((r) => r.league_id as string);
  }
  if (leagueIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no tracked leagues" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const results = await Promise.all(leagueIds.map((id) => snapshotLeague(supabase, id, isFinal)));
  return new Response(JSON.stringify({ ok: true, leagues: results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
