// get-opponent-news — scout this week's fantasy opponent.
// Resolves the user's current matchup opponent from Sleeper, pulls recent news
// for the opponent's roster, and folds in this-week game context (matchup
// difficulty, weather, bye) from the game_context cache. Headline-based — no AI
// blurb, since these are players you're facing, not yours.
//
// Input (POST JSON): { "league_id": "...", "user_id": "...", "week"?: 12 }
// Output: { ok, week, opponent: { name, record }, items: [ {
//            id, url, headline, news_type, published_at,
//            reporter, reporter_name,
//            players: [{ name, position, team, injury }],
//            game: { opponent, home_away, difficulty, weather, bye } } ] }
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORTER_NAMES: Record<string, string> = {
  breaking: "Breaking Desk", beat: "The Beat", social: "The Voice",
};
const reporterName = (t: string | null) => REPORTER_NAMES[t ?? "beat"] ?? "The Beat";

type GameInfo = {
  opp?: string; homeAway?: string; bye?: boolean;
  difficulty?: { tier?: string } | null; weather?: { label?: string } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let leagueId = "", userId = "", weekOverride: number | undefined;
  try {
    const body = await req.json();
    leagueId = String(body.league_id ?? "");
    userId = String(body.user_id ?? "");
    if (body.week != null) weekOverride = Number(body.week);
  } catch (_) { /* ignore */ }
  if (!leagueId || !userId) {
    return new Response(JSON.stringify({ error: "expected { league_id, user_id }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Current season/week.
  let season = new Date().getFullYear().toString();
  let week = weekOverride ?? 1;
  if (weekOverride == null) {
    try {
      const st = await (await fetch("https://api.sleeper.app/v1/state/nfl")).json();
      season = st.season?.toString() ?? season;
      week = st.week > 0 ? Number(st.week) : 1;
    } catch (_) { /* defaults */ }
  }

  // Rosters, users, and this-week matchups.
  const [rostersRes, usersRes, matchupsRes] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`),
  ]);
  const rosters = rostersRes.ok ? await rostersRes.json() : [];
  const users = usersRes.ok ? await usersRes.json() : [];
  const matchups = matchupsRes.ok ? await matchupsRes.json() : [];

  const nameByUser: Record<string, string> = {};
  for (const u of users) nameByUser[u.user_id] = u.username || u.display_name || "Opponent";

  const mine = rosters.find((r: any) => r.owner_id === userId);
  const myEntry = mine && matchups.find((m: any) => m.roster_id === mine.roster_id);
  const emptyOut = (msg = "no_matchup") =>
    new Response(JSON.stringify({ ok: true, week, opponent: null, items: [], note: msg }),
      { headers: { ...cors, "Content-Type": "application/json" } });
  if (!myEntry || myEntry.matchup_id == null) return emptyOut();

  const oppEntry = matchups.find(
    (m: any) => m.matchup_id === myEntry.matchup_id && m.roster_id !== mine.roster_id,
  );
  if (!oppEntry) return emptyOut();
  const oppRoster = rosters.find((r: any) => r.roster_id === oppEntry.roster_id);
  const oppName = nameByUser[oppRoster?.owner_id] ?? "Opponent";
  const oppRecord = oppRoster?.settings
    ? `${oppRoster.settings.wins ?? 0}-${oppRoster.settings.losses ?? 0}` : "";

  // Opponent's players (prefer starters; fall back to full roster).
  const oppIds: string[] = (oppEntry.starters?.length ? oppEntry.starters : (oppRoster?.players ?? []))
    .map((x: unknown) => String(x)).filter(Boolean);
  if (!oppIds.length) return emptyOut("empty_roster");

  // Player display info, opponent news, and game context in parallel.
  const [{ data: playerRows }, { data: news }] = await Promise.all([
    supabase.from("players")
      .select("sleeper_player_id, full_name, position, team, injury_status")
      .in("sleeper_player_id", oppIds),
    supabase.from("news_items")
      .select("id, url, headline, published_at, player_ids, news_type, reporter_type")
      .overlaps("player_ids", oppIds)
      .order("published_at", { ascending: false })
      .limit(24),
  ]);
  const pMap = new Map((playerRows ?? []).map((p) => [p.sleeper_player_id, p]));
  const teams = [...new Set((playerRows ?? []).map((p: any) => p.team).filter(Boolean))];

  const gameByTeam = new Map<string, GameInfo>();
  if (teams.length) {
    const { data: gc } = await supabase.from("game_context")
      .select("team, data").eq("season", season).eq("week", week).in("team", teams);
    for (const row of gc ?? []) gameByTeam.set(row.team, (row.data ?? {}) as GameInfo);
  }

  const oppIdSet = new Set(oppIds);
  const items = (news ?? []).map((it) => {
    const matchedIds = (it.player_ids ?? []).filter((pid: string) => oppIdSet.has(pid));
    const players = matchedIds.map((pid: string) => pMap.get(pid)).filter(Boolean).map((p: any) => ({
      name: p.full_name, position: p.position, team: p.team, injury: p.injury_status ?? null,
    }));
    if (!players.length) return null;
    const g = players[0].team ? gameByTeam.get(players[0].team) : undefined;
    return {
      id: it.id, url: it.url, headline: it.headline,
      news_type: it.news_type, published_at: it.published_at,
      reporter: it.reporter_type ?? "beat", reporter_name: reporterName(it.reporter_type),
      players,
      game: g ? {
        opponent: g.opp ?? null, home_away: g.homeAway ?? null,
        difficulty: g.difficulty?.tier ?? null, weather: g.weather?.label ?? null,
        bye: g.bye === true,
      } : null,
    };
  }).filter(Boolean);

  return new Response(
    JSON.stringify({ ok: true, week, opponent: { name: oppName, record: oppRecord }, items }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
