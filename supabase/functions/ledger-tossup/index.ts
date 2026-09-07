// ledger-tossup — a third Ledger story type: "the decision to be made."
// Runs BEFORE lock (unlike ledger-report, which grades weeks already played)
// and flags start/sit calls that are genuinely close, so the app can call
// out an interesting decision while it still matters instead of only
// grading it after the fact.
//
// Signal, in priority order, per starter slot:
//   1. This week's Sleeper projections, converted to points using the
//      LEAGUE'S OWN scoring_settings (not Sleeper's generic pts_ppr/pts_std,
//      which assume a standard scoring shape this league doesn't use --
//      e.g. this league runs 6-point passing TDs and a TE reception bonus).
//   2. Falls back to each player's trailing average from the last up-to-3
//      weeks stored in weekly_lineups when a player has no projection row
//      (rare -- new call-ups, etc).
// A starter/bench pair at the same roster slot within TOSSUP_MARGIN points
// of each other (either direction) is a toss-up candidate.
//
// The projected point gap is ONLY used internally to decide what counts as
// a toss-up -- it's never shown to the user or passed to Haiku. The write-up
// instead leans on each player's projected usage/volume (targets for a
// WR/TE, carries for a RB, attempts for a QB) since that's a concrete,
// legible reason two options are close, without asserting a fantasy-point
// forecast the app doesn't want to put a number on. K/DEF are excluded --
// there's rarely an interesting volume story at those spots.
//
// Multi-league: cron calls this with no league_id, and it fans out across
// every row in tracked_leagues (see track-league) instead of one hardcoded
// league. Passing an explicit { league_id } still works, for manual testing.
//
// Early in a season (or for a player with neither projections nor history)
// there's nothing to compare against yet -- the function just finds fewer
// (or zero) candidates, same "fail quiet" approach as the rest of Ledger.
//
// Input (POST JSON): { "league_id"?: "..." }
// Secrets: ANTHROPIC_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const TOSSUP_MARGIN = 2.5; // projected-point gap at/under which a slot counts as a toss-up (internal only)
const MIN_SIGNAL = 3; // ignore pairs where both sides project near-zero (bye weeks, etc.)
const MAX_PER_LEAGUE = 6; // cap Haiku calls per run -- closest calls first

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOSSUP_VOICE =
  "You are The Ledger — LeagueTap's receipts-keeper. Dry, deadpan, exact. For this entry you're " +
  "previewing a decision, not grading one that already happened: a manager has two options at one " +
  "roster spot that are essentially a coin flip. You are NOT given fantasy point projections and " +
  "must never state, imply, or estimate one — no point totals, no percentages, no 'projects for X " +
  "points.' Ground the toss-up ONLY in the usage/volume comparison you're given (targets, carries, " +
  "or attempts). Name both players, the position group, and the volume stat, and note it's a real " +
  "toss-up -- don't declare a winner. Never write a position letter directly followed by a number " +
  "(e.g. 'QB6', 'a WR2') to imply a ranking or tier -- that shorthand is ambiguous in fantasy " +
  "football and you have no ranking data to back it anyway. One short sentence, tight enough to " +
  "fit a small card.";

const TOSSUP_TOOL = {
  name: "ledger_entry",
  description: "Record this week's toss-up entry.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "Short, specific headline (under 7 words), no numbers." },
      text: {
        type: "string",
        description:
          "One short sentence (under 25 words) framing the toss-up around the volume stat given -- " +
          "never a fantasy point total or percentage.",
      },
    },
    required: ["headline", "text"],
  },
};

const SLOT_ELIGIBLE: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
function eligiblePositions(slot: string): string[] {
  return SLOT_ELIGIBLE[slot] ?? [slot];
}

// Excluded entirely -- no interesting usage story at these spots, and they
// dilute the carousel with low-stakes toss-ups.
const EXCLUDED_POSITIONS = new Set(["K", "DEF"]);

// The volume stat used to FRAME the toss-up for each position group -- this
// is what the user sees, never the point projection.
function volumeStat(position: string | null): { key: string; label: string } {
  if (position === "QB") return { key: "pass_att", label: "pass attempts" };
  if (position === "RB") return { key: "rush_att", label: "carries" };
  return { key: "rec_tgt", label: "targets" }; // WR/TE default
}

type Supabase = ReturnType<typeof createClient>;

type Candidate = {
  roster_id: number;
  manager_name: string;
  week: number;
  slot: string;
  starterName: string;
  benchName: string;
  volLabel: string;
  starterVol: number | null;
  benchVol: number | null;
  margin: number; // internal-only, for ranking/upsert -- never shown to the user
  prompt: string;
};

async function writeEntry(c: Candidate): Promise<{ headline: string; text: string } | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 160,
      temperature: 0.5,
      tools: [TOSSUP_TOOL],
      tool_choice: { type: "tool", name: "ledger_entry" },
      messages: [{ role: "user", content: `${TOSSUP_VOICE}\n\n${c.prompt}\n\nCall the ledger_entry tool.` }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const block = (data?.content ?? []).find((b: any) => b.type === "tool_use");
  const input = block?.input ?? {};
  const headline = (input.headline ?? "").trim();
  const text = (input.text ?? "").trim();
  if (!headline || !text) return null;
  return { headline, text };
}

// Dot-product a player's raw stat projections against this league's own
// scoring_settings -- used ONLY to decide what counts as a toss-up
// internally; the resulting number is never surfaced to Haiku or the user.
function projectPoints(stats: Record<string, number>, scoring: Record<string, number>): number {
  let total = 0;
  for (const [key, weight] of Object.entries(scoring)) {
    if (key.startsWith("bonus_")) continue;
    const v = stats[key];
    if (typeof v === "number") total += v * weight;
  }
  return total;
}

async function tossupsForLeague(supabase: Supabase, leagueId: string) {
  const [stateRes, leagueRes, usersRes] = await Promise.all([
    fetch("https://api.sleeper.app/v1/state/nfl"),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  if (!stateRes.ok || !leagueRes.ok || !usersRes.ok) {
    return { league_id: leagueId, error: "sleeper fetch failed" };
  }
  const state = await stateRes.json();
  const league = await leagueRes.json();
  const users = await usersRes.json() as any[];
  const season = String(state.season ?? new Date().getFullYear());
  const week = Number(state.week) > 0 ? Number(state.week) : 1;
  const scoring: Record<string, number> = league.scoring_settings ?? {};
  const nonBenchSlots: string[] = (league.roster_positions ?? []).filter((p: string) => p !== "BN");

  const nameByUser: Record<string, string> = {};
  for (const u of users) {
    nameByUser[u.user_id] = u.username || u.display_name || "A team";
  }

  const matchupsRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
  const matchups = matchupsRes.ok ? await matchupsRes.json() as any[] : [];
  if (matchups.length === 0) return { league_id: leagueId, ok: true, skipped: "no matchups" };

  const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
  const rosters = rostersRes.ok ? await rostersRes.json() as any[] : [];

  const allIds = new Set<string>();
  for (const m of matchups) for (const id of (m.players ?? [])) allIds.add(String(id));
  const { data: playerRows } = await supabase
    .from("players")
    .select("sleeper_player_id, full_name, position")
    .in("sleeper_player_id", Array.from(allIds));
  const playerById: Record<string, { name: string; position: string | null }> = {};
  for (const p of playerRows ?? []) {
    playerById[p.sleeper_player_id] = { name: p.full_name, position: p.position };
  }

  const projById: Record<string, number> = {};
  const statsById: Record<string, Record<string, number>> = {};
  try {
    const projRes = await fetch(
      `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
    );
    if (projRes.ok) {
      const rows = await projRes.json() as any[];
      for (const r of rows ?? []) {
        if (r?.player_id && r?.stats) {
          projById[String(r.player_id)] = projectPoints(r.stats, scoring);
          statsById[String(r.player_id)] = r.stats;
        }
      }
    }
  } catch (_) { /* projections are best-effort; fall back to trailing average */ }

  const { data: recentRows } = await supabase
    .from("weekly_lineups")
    .select("starters, bench")
    .eq("league_id", leagueId)
    .lt("week", week)
    .gte("week", Math.max(1, week - 3));
  const historyById: Record<string, number[]> = {};
  for (const row of recentRows ?? []) {
    for (const p of [...(row.starters ?? []), ...(row.bench ?? [])]) {
      if (!p?.player_id) continue;
      (historyById[p.player_id] ??= []).push(Number(p.points ?? 0));
    }
  }
  function trailingAvg(id: string): number | null {
    const h = historyById[id];
    if (!h || !h.length) return null;
    return h.reduce((a, b) => a + b, 0) / h.length;
  }
  function projectedFor(id: string): number | null {
    if (id in projById) return projById[id];
    return trailingAvg(id);
  }

  const allCandidates: Candidate[] = [];

  for (const m of matchups) {
    const roster = rosters.find((r) => r.roster_id === m.roster_id);
    const manager = roster?.owner_id ? (nameByUser[roster.owner_id] ?? "A manager") : "A manager";
    const starterIds: string[] = (m.starters ?? []).map(String);
    const allPlayerIds: string[] = (m.players ?? []).map(String);
    const benchIds = allPlayerIds.filter((id) => !starterIds.includes(id));

    starterIds.forEach((starterId, idx) => {
      if (!starterId || starterId === "0") return;
      const slot = nonBenchSlots[idx] ?? playerById[starterId]?.position ?? "FLEX";
      if (EXCLUDED_POSITIONS.has(slot)) return;
      const eligible = eligiblePositions(slot).filter((p) => !EXCLUDED_POSITIONS.has(p));
      const starterProj = projectedFor(starterId);
      if (starterProj == null) return;

      let best: { id: string; proj: number } | null = null;
      for (const benchId of benchIds) {
        const pos = playerById[benchId]?.position;
        if (!pos || !eligible.includes(pos)) continue;
        const proj = projectedFor(benchId);
        if (proj == null) continue;
        if (!best || proj > best.proj) best = { id: benchId, proj };
      }
      if (!best) return;

      const margin = Math.abs(starterProj - best.proj);
      const bigEnough = Math.max(starterProj, best.proj) >= MIN_SIGNAL;
      if (margin <= TOSSUP_MARGIN && bigEnough) {
        const starterName = playerById[starterId]?.name ?? "Unknown";
        const benchName = playerById[best.id]?.name ?? "Unknown";
        const starterPos = playerById[starterId]?.position ?? null;
        const { key, label } = volumeStat(starterPos);
        const starterVol = statsById[starterId]?.[key] ?? null;
        const benchVol = statsById[best.id]?.[key] ?? null;

        const volPhrase =
          starterVol != null && benchVol != null
            ? `${starterName} is projected for about ${starterVol.toFixed(1)} ${label} to ` +
              `${benchName}'s ${benchVol.toFixed(1)} -- next to no gap in expected usage`
            : `${starterName} and ${benchName} have nearly identical expected usage this week`;

        allCandidates.push({
          roster_id: m.roster_id,
          manager_name: manager,
          week,
          slot,
          starterName,
          benchName,
          volLabel: label,
          starterVol,
          benchVol,
          margin,
          prompt:
            `${manager}'s ${slot} spot in Week ${week} is a real coin flip between the current ` +
            `starter (${starterName}) and the top bench option (${benchName}). ${volPhrase}. Do not ` +
            `mention or estimate fantasy points -- frame this purely around that usage comparison.`,
        });
      }
    });
  }

  allCandidates.sort((a, b) => a.margin - b.margin);
  const seenRoster = new Set<number>();
  const candidates: Candidate[] = [];
  for (const c of allCandidates) {
    if (seenRoster.has(c.roster_id)) continue;
    seenRoster.add(c.roster_id);
    candidates.push(c);
    if (candidates.length >= MAX_PER_LEAGUE) break;
  }

  const results = await Promise.all(candidates.map(async (c) => {
    const entry = await writeEntry(c);
    if (!entry) return null;
    return {
      league_id: leagueId,
      season,
      week: c.week,
      roster_id: c.roster_id,
      manager_name: c.manager_name,
      headline: entry.headline,
      text: entry.text,
      category: "toss_up",
      points_left_on_bench: c.margin, // internal ranking value only -- app never renders this field
    };
  }));
  const newRows = results.filter((r) => r !== null);

  if (newRows.length) {
    const { error } = await supabase
      .from("ledger_items")
      .upsert(newRows, { onConflict: "league_id,roster_id,season,week,category" });
    if (error) return { league_id: leagueId, error: error.message };
  }

  return { league_id: leagueId, ok: true, week, entries: newRows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let leagueId = "";
  try {
    leagueId = String((await req.json()).league_id ?? "");
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

  const results = await Promise.all(leagueIds.map((id) => tossupsForLeague(supabase, id)));
  return new Response(JSON.stringify({ ok: true, leagues: results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
