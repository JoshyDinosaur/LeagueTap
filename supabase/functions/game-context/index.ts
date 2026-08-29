// game-context — per-NFL-team game context for the Gameplan tab:
//   opponent, kickoff, weather (Open-Meteo, free/no key), and matchup difficulty
//   (from opponent defense points-allowed via ESPN standings).
//
// Input (POST JSON): { teams?: ["SF",...], player_ids?: [...], week?, season?, seasonType? }
// Output: { ok, season, week, teams: { "SF": {...}, ... } }
//
// Results are cached per (season, week, team) in game_context for ~3h.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

// Home stadium coords + dome flag (retractable roofs treated as indoor).
const STADIUMS: Record<string, { lat: number; lon: number; dome: boolean }> = {
  ARI: { lat: 33.5277, lon: -112.2626, dome: true }, ATL: { lat: 33.7554, lon: -84.4009, dome: true },
  BAL: { lat: 39.2780, lon: -76.6227, dome: false }, BUF: { lat: 42.7738, lon: -78.7870, dome: false },
  CAR: { lat: 35.2258, lon: -80.8528, dome: false }, CHI: { lat: 41.8623, lon: -87.6167, dome: false },
  CIN: { lat: 39.0954, lon: -84.5160, dome: false }, CLE: { lat: 41.5061, lon: -81.6995, dome: false },
  DAL: { lat: 32.7473, lon: -97.0945, dome: true }, DEN: { lat: 39.7439, lon: -105.0201, dome: false },
  DET: { lat: 42.3400, lon: -83.0456, dome: true }, GB: { lat: 44.5013, lon: -88.0622, dome: false },
  HOU: { lat: 29.6847, lon: -95.4107, dome: true }, IND: { lat: 39.7601, lon: -86.1639, dome: true },
  JAX: { lat: 30.3239, lon: -81.6373, dome: false }, KC: { lat: 39.0489, lon: -94.4839, dome: false },
  LAC: { lat: 33.9535, lon: -118.3392, dome: true }, LAR: { lat: 33.9535, lon: -118.3392, dome: true },
  LV: { lat: 36.0909, lon: -115.1833, dome: true }, MIA: { lat: 25.9580, lon: -80.2389, dome: false },
  MIN: { lat: 44.9737, lon: -93.2581, dome: true }, NE: { lat: 42.0909, lon: -71.2643, dome: false },
  NO: { lat: 29.9511, lon: -90.0812, dome: true }, NYG: { lat: 40.8128, lon: -74.0742, dome: false },
  NYJ: { lat: 40.8128, lon: -74.0742, dome: false }, PHI: { lat: 39.9008, lon: -75.1675, dome: false },
  PIT: { lat: 40.4468, lon: -80.0158, dome: false }, SEA: { lat: 47.5952, lon: -122.3316, dome: false },
  SF: { lat: 37.4030, lon: -121.9700, dome: false }, TB: { lat: 27.9759, lon: -82.5033, dome: false },
  TEN: { lat: 36.1665, lon: -86.7713, dome: false }, WAS: { lat: 38.9077, lon: -76.8645, dome: false },
};

// ESPN sometimes uses different abbreviations; normalize to Sleeper/STADIUMS.
const ABBR_FIX: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };
const fix = (a: string) => ABBR_FIX[a] ?? a;

function weatherLabel(code: number, tempF: number, wind: number, precip: number) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Snow", icon: "snow" };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code) || precip >= 55)
    return { label: "Rain", icon: "rain" };
  if (wind >= 18) return { label: "Windy", icon: "wind" };
  if (tempF <= 32) return { label: "Cold", icon: "cold" };
  if (code <= 1) return { label: "Clear", icon: "clear" };
  return { label: "Clouds", icon: "clouds" };
}

async function fetchSchedule(season: string, seasonType: number, week: number) {
  // team -> { opp, homeAway, kickoff(ISO), home(abbr) }
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${seasonType}&week=${week}`;
  const map: Record<string, any> = {};
  try {
    const r = await fetch(url);
    if (!r.ok) return map;
    const j = await r.json();
    for (const ev of j.events ?? []) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const date = comp.date;
      const cs = comp.competitors ?? [];
      const home = cs.find((c: any) => c.homeAway === "home");
      const away = cs.find((c: any) => c.homeAway === "away");
      if (!home || !away) continue;
      const ha = fix(home.team?.abbreviation ?? "");
      const aa = fix(away.team?.abbreviation ?? "");
      const ks = (() => {
        const dt = new Date(date);
        return isNaN(dt.getTime()) ? date : dt.toISOString();
      })();
      map[ha] = { opp: aa, homeAway: "home", kickoff: ks, home: ha };
      map[aa] = { opp: ha, homeAway: "away", kickoff: ks, home: ha };
    }
  } catch (_) { /* schedule unavailable */ }
  return map;
}

// Difficulty from points allowed per game, accumulated from prior weeks'
// scoreboards (reuses the proven scoreboard parser — reliable shape).
async function fetchDifficulty(season: string, seasonType: number, week: number) {
  const out: Record<string, string> = {};
  const allowed: Record<string, number> = {};
  const games: Record<string, number> = {};
  const weeks = [];
  for (let w = Math.max(1, week - 6); w < week; w++) weeks.push(w);
  if (!weeks.length) return out; // week 1: no prior data yet

  await Promise.all(weeks.map(async (w) => {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${seasonType}&week=${w}`;
      const r = await fetch(url);
      if (!r.ok) return;
      const j = await r.json();
      for (const ev of j.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp || comp.status?.type?.completed === false) continue;
        const cs = comp.competitors ?? [];
        if (cs.length !== 2) continue;
        const a = cs[0], b = cs[1];
        const ta = fix(a.team?.abbreviation ?? ""), tb = fix(b.team?.abbreviation ?? "");
        const sa = Number(a.score), sb = Number(b.score);
        if (!ta || !tb || isNaN(sa) || isNaN(sb)) continue;
        allowed[ta] = (allowed[ta] ?? 0) + sb; games[ta] = (games[ta] ?? 0) + 1;
        allowed[tb] = (allowed[tb] ?? 0) + sa; games[tb] = (games[tb] ?? 0) + 1;
      }
    } catch (_) { /* skip week */ }
  }));

  const rows = Object.keys(allowed)
    .filter((t) => games[t] > 0)
    .map((t) => ({ team: t, pa: allowed[t] / games[t] }));
  rows.sort((a, b) => a.pa - b.pa); // fewest allowed = toughest defense
  const n = rows.length;
  rows.forEach((row, i) => {
    out[row.team] = i < n / 3 ? "tough" : i < (2 * n) / 3 ? "medium" : "easy";
  });
  return out;
}

async function fetchWeather(lat: number, lon: number, kickoff: string) {
  try {
    const d = new Date(kickoff);
    if (isNaN(d.getTime())) return null;
    const date = d.toISOString().slice(0, 10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&start_date=${date}&end_date=${date}`;
    const r = await fetch(url);
    if (!r.ok) return null; // beyond forecast window etc.
    const j = await r.json();
    const times: string[] = j.hourly?.time ?? [];
    if (!times.length) return null;
    const hour = d.getUTCHours();
    let idx = times.findIndex((t) => new Date(t + ":00Z").getUTCHours() === hour);
    if (idx < 0) idx = Math.min(13, times.length - 1); // ~1pm fallback
    const tempF = Math.round(j.hourly.temperature_2m?.[idx] ?? 0);
    const wind = Math.round(j.hourly.wind_speed_10m?.[idx] ?? 0);
    const precip = j.hourly.precipitation_probability?.[idx] ?? 0;
    const code = j.hourly.weather_code?.[idx] ?? 0;
    return { ...weatherLabel(code, tempF, wind, precip), tempF };
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }

  // Determine season/week (Sleeper state unless overridden).
  let season = body.season?.toString();
  let week = body.week ? Number(body.week) : undefined;
  let seasonType = 2; // regular
  if (body.seasonType === "pre") seasonType = 1;
  if (body.seasonType === "post") seasonType = 3;
  if (!season || !week) {
    try {
      const st = await (await fetch("https://api.sleeper.app/v1/state/nfl")).json();
      season = season ?? st.season?.toString();
      week = week ?? (st.week > 0 ? st.week : 1);
      if (!body.seasonType && st.season_type === "pre") seasonType = 1;
    } catch (_) {
      season = season ?? new Date().getFullYear().toString();
      week = week ?? 1;
    }
  }

  // Requested teams (from explicit teams or resolved from player_ids).
  let teams: string[] = (body.teams ?? []).map((t: string) => fix(String(t)));
  if (!teams.length && Array.isArray(body.player_ids) && body.player_ids.length) {
    const { data } = await supabase
      .from("players").select("team").in("sleeper_player_id", body.player_ids.map(String));
    teams = [...new Set((data ?? []).map((p: any) => fix(p.team)).filter(Boolean))];
  }

  // Serve from cache if the week is fresh (unless nocache override).
  const { data: cached } = body.nocache
    ? { data: [] as any[] }
    : await supabase
        .from("game_context").select("team, data, fetched_at").eq("season", season).eq("week", week);
  const fresh = (cached ?? []).filter(
    (r: any) => Date.now() - new Date(r.fetched_at).getTime() < CACHE_TTL_MS,
  );
  let teamData: Record<string, any> = {};
  if (fresh.length) {
    for (const r of fresh) teamData[r.team] = r.data;
  } else {
    // Build the whole week once.
    const [schedule, difficulty] = await Promise.all([
      fetchSchedule(season!, seasonType, week!),
      fetchDifficulty(season!, seasonType, week!),
    ]);
    const homeTeams = [...new Set(Object.values(schedule).map((g: any) => g.home))];
    const wxByHome: Record<string, any> = {};
    await Promise.all(homeTeams.map(async (h) => {
      const st = STADIUMS[h];
      if (!st) return;
      wxByHome[h] = st.dome
        ? { label: "Indoor", icon: "dome", tempF: null }
        : await fetchWeather(st.lat, st.lon, schedule[h].kickoff);
    }));

    const rows: any[] = [];
    for (const t of Object.keys(STADIUMS)) {
      const g = schedule[t];
      const data = g
        ? {
            opp: g.opp,
            homeAway: g.homeAway,
            kickoff: g.kickoff,
            bye: false,
            weather: wxByHome[g.home] ?? null,
            difficulty: difficulty[g.opp]
              ? { tier: difficulty[g.opp], label: difficulty[g.opp][0].toUpperCase() + difficulty[g.opp].slice(1) }
              : null,
          }
        : { bye: true };
      teamData[t] = data;
      rows.push({ season, week, team: t, data, fetched_at: new Date().toISOString() });
    }
    await supabase.from("game_context").upsert(rows);
  }

  const result: Record<string, any> = {};
  const wanted = teams.length ? teams : Object.keys(teamData);
  for (const t of wanted) if (teamData[t]) result[t] = teamData[t];

  return new Response(JSON.stringify({ ok: true, season, week, teams: result }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
