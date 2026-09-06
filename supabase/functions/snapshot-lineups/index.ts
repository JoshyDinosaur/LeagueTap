// snapshot-lineups — captures one league's current-week starters, bench, and
// each player's points-so-far, so "The Ledger" reporter has real history to
// judge start/sit calls against.
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

type PlayerLine = { player_id: string; name: string; position: string | null; points: number };
type Supabase = ReturnType<typeof createClient>;

async function snapshotLeague(supabase: Supabase, leagueId: string, isFinal: boolean) {
  const [stateRes, rostersRes, usersRes] = await Promise.all([
    fetch("https://api.sleeper.app/v1/state/nfl"),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  if (!stateRes.ok || !rostersRes.ok || !usersRes.ok) {
    return { league_id: leagueId, error: "sleeper fetch failed" };
  }
  const state = await stateRes.json();
  const season = String(state.season ?? new Date().getFullYear());
  const week = Number(state.week) > 0 ? Number(state.week) : 1;
  const rosters = await rostersRes.json() as any[];
  const users = await usersRes.json() as any[];

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

    const line = (id: string): PlayerLine => ({
      player_id: id,
      name: playerById[id]?.name ?? "Unknown",
      position: playerById[id]?.position ?? null,
      points: Number(pointsById[id] ?? 0),
    });

    const starters = starterIds.map(line);
    const bench = benchIds.map(line);
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
