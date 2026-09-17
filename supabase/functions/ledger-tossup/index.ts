// ledger-tossup — a third Ledger story type: "the decision to be made."
// Runs BEFORE lock (unlike ledger-report, which grades weeks already played)
// and flags start/sit calls that are genuinely close, so the app can call
// out an interesting decision while it still matters instead of only
// grading it after the fact.
//
// Signal, in priority order, per starter slot, per side (starter or bench
// alternative) independently:
//   1. If that player's game has already happened this week (a row exists
//      in Sleeper's real stats endpoint), their REAL performance so far --
//      this is a "half-decided" toss-up: one game already played (e.g. a
//      Thursday-night starter), the other still ahead. Perfectly legitimate
//      -- the decision genuinely hasn't resolved yet since the other side's
//      game hasn't happened.
//   2. Otherwise, this week's Sleeper projections, converted to points
//      using the LEAGUE'S OWN scoring_settings (not Sleeper's generic
//      pts_ppr/pts_std, which assume a standard scoring shape this league
//      doesn't use -- e.g. this league runs 6-point passing TDs and a TE
//      reception bonus).
//   3. Falls back to each player's trailing average from the last up-to-3
//      weeks stored in weekly_lineups when a player has no projection row
//      (rare -- new call-ups, etc).
// A starter/bench pair at the same roster slot within TOSSUP_MARGIN points
// of each other (either direction) is a toss-up candidate -- UNLESS both
// sides have already played, in which case there's no decision left to
// preview (that's ledger-report's job, not this one's).
//
// The point gap (real, projected, or a mix of the two) is ONLY used
// internally to decide what counts as a toss-up -- it's never shown to the
// user or passed to Haiku. The write-up instead leans on each player's
// usage/volume (targets for a WR/TE, carries for a RB, attempts for a QB):
// the ALREADY-PLAYED side's real recorded volume, the NOT-YET-PLAYED side's
// projected volume -- a concrete, legible reason the two options are close,
// without asserting a fantasy-point forecast the app doesn't want to put a
// number on. K/DEF are excluded -- there's rarely an interesting volume
// story at those spots.
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
import { eligiblePositions } from "../_shared/lineup_decisions.ts";

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
  "roster spot that are essentially a coin flip. You are NEVER given a fantasy point projection and " +
  "must never state, imply, or estimate one — no point totals, no percentages. Every volume number " +
  "you ARE given (targets, carries, attempts) is already a whole number, pre-rounded -- always state " +
  "both sides' numbers plainly, and never write, imply, or invent a fractional or decimal figure of " +
  "any kind, for anything, ever. If one side has ALREADY played, their number is a real, " +
  "already-recorded count -- state it in the past tense (e.g. 'already logged 9 targets'). If a side " +
  "hasn't played yet, their number is a rounded projection -- state it in the future tense (e.g. " +
  "'projects for about 12 carries'). A flex or super-flex slot can pit two DIFFERENT positions " +
  "against each other (a running back's carries vs. a receiver's targets, say) -- when that happens " +
  "each side keeps its OWN stat category, and you must NEVER call the two numbers 'identical' or " +
  "'tied' just because they're close or even the same digit, since they're not measuring the same " +
  "thing; instead say both usage numbers plainly and note the decision itself is close (e.g. 'projects " +
  "for 12 carries -- against 11 expected targets on the other side, it's still a coin flip'). Only " +
  "when BOTH sides share the exact same stat category and the same number should you call it a tie " +
  "-- say so plainly using that shared number ('dead even at 9 carries,' 'tied at 12,' 'identical " +
  "targets, 6 apiece') -- vary the phrasing each time, don't repeat the same stock line. Name both " +
  "players and the position group, and note it's a real toss-up -- don't declare a winner. Never " +
  "write a position letter directly followed by a " +
  "number (e.g. 'QB6', 'a WR2') to imply a ranking or tier -- that shorthand is ambiguous in fantasy " +
  "football and you have no ranking data to back it anyway. One short sentence, tight enough to fit " +
  "a small card.";

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
          "One short sentence (under 25 words) framing the toss-up around the volume stat category " +
          "given -- never a fantasy point total, percentage, or any decimal/fractional number. Always " +
          "state both sides' given whole-number counts (past tense if already recorded, future/" +
          "projected tense if not). When both sides share the same stat category and the same " +
          "number, say so plainly using that number instead of just calling it close. When the two " +
          "sides have DIFFERENT stat categories (a flex/super-flex cross-position matchup), never " +
          "call the numbers identical or tied -- state each one under its own category.",
      },
    },
    required: ["headline", "text"],
  },
};

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
  starterId: string;
  benchId: string;
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
      // TOSSUP_VOICE and the tool schema are identical on every call this
      // function ever makes -- cached so repeat runs (and the several
      // candidates within one run) pay full price only once.
      tools: [{ ...TOSSUP_TOOL, cache_control: { type: "ephemeral" } }],
      tool_choice: { type: "tool", name: "ledger_entry" },
      system: [{ type: "text", text: TOSSUP_VOICE, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${c.prompt}\n\nCall the ledger_entry tool.` }],
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
  const projStatsById: Record<string, Record<string, number>> = {};
  try {
    const projRes = await fetch(
      `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
    );
    if (projRes.ok) {
      const rows = await projRes.json() as any[];
      for (const r of rows ?? []) {
        if (r?.player_id && r?.stats) {
          projById[String(r.player_id)] = projectPoints(r.stats, scoring);
          projStatsById[String(r.player_id)] = r.stats;
        }
      }
    }
  } catch (_) { /* projections are best-effort; fall back to trailing average */ }

  // Real box-score stats for players whose game has ALREADY happened this
  // week (e.g. a Thursday-night starter, evaluated mid-week) -- lets a
  // toss-up be framed as one side's real, already-locked-in performance vs.
  // the other side's still-ahead projection, instead of only ever comparing
  // two projections. Same endpoint snapshot-lineups uses for actual stats.
  const actualStatsById: Record<string, Record<string, number>> = {};
  try {
    const statsRes = await fetch(
      `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=regular`,
    );
    if (statsRes.ok) {
      const rows = await statsRes.json() as any[];
      for (const r of rows ?? []) {
        if (r?.player_id && r?.stats && Object.keys(r.stats).length > 0) {
          actualStatsById[String(r.player_id)] = r.stats;
        }
      }
    }
  } catch (_) { /* best-effort */ }
  function hasPlayed(id: string): boolean {
    return !!actualStatsById[id];
  }

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
  // Real score (from actual stats) once a player's game has happened;
  // projection/trailing-average otherwise. Lets the "is this still close"
  // check reflect what's actually known once one side's game has resolved.
  function pointsFor(id: string): number | null {
    if (hasPlayed(id)) return projectPoints(actualStatsById[id], scoring);
    return projectedFor(id);
  }
  // The volume number to show for this player -- their REAL recorded value
  // if their game has happened, else their projected one.
  function volFor(id: string, key: string): number | null {
    const source = hasPlayed(id) ? actualStatsById[id] : projStatsById[id];
    return source?.[key] ?? null;
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
      const starterProj = pointsFor(starterId);
      if (starterProj == null) return;

      let best: { id: string; proj: number } | null = null;
      for (const benchId of benchIds) {
        const pos = playerById[benchId]?.position;
        if (!pos || !eligible.includes(pos)) continue;
        const proj = pointsFor(benchId);
        if (proj == null) continue;
        if (!best || proj > best.proj) best = { id: benchId, proj };
      }
      if (!best) return;

      // Both games already happened -- there's no decision left to preview,
      // that's ledger-report's job (grading), not this one's (previewing).
      if (hasPlayed(starterId) && hasPlayed(best.id)) return;

      const margin = Math.abs(starterProj - best.proj);
      const bigEnough = Math.max(starterProj, best.proj) >= MIN_SIGNAL;
      if (margin <= TOSSUP_MARGIN && bigEnough) {
        const starterName = playerById[starterId]?.name ?? "Unknown";
        const benchName = playerById[best.id]?.name ?? "Unknown";
        const starterPos = playerById[starterId]?.position ?? null;
        const benchPos = playerById[best.id]?.position ?? null;
        // Each side's volume stat is picked from ITS OWN position -- a flex
        // or super-flex slot can pit a RB against a WR/QB/TE, and crediting
        // a receiver with "0 carries" (the starter's stat, forced onto a
        // player who doesn't carry the ball) is nonsense. Only same-position
        // pairs end up comparing the same category; cross-position pairs
        // compare each player's own relevant stat instead.
        const starterStat = volumeStat(starterPos);
        const benchStat = volumeStat(benchPos);
        const starterVol = volFor(starterId, starterStat.key);
        const benchVol = volFor(best.id, benchStat.key);
        const starterPlayed = hasPlayed(starterId);
        const benchPlayed = hasPlayed(best.id);
        const sameCategory = starterStat.key === benchStat.key;

        // Always round to a whole number before it ever reaches the prompt
        // -- Sleeper's projections are fractional by nature, but the Ledger
        // never states a decimal/floating-point value for anything, ever.
        // Both sides' numbers are always stated (never omitted); a real,
        // already-recorded count is a fact (past tense), a still-projected
        // one is a rounded estimate (future tense).
        const starterVolRounded = starterVol != null ? Math.round(starterVol) : null;
        const benchVolRounded = benchVol != null ? Math.round(benchVol) : null;

        const sideFact = (name: string, vol: number | null, played: boolean, label: string) =>
          vol == null
            ? `${name}'s ${label} are unknown`
            : played
            ? `${name} already recorded ${vol} ${label}`
            : `${name} projects for about ${vol} ${label}`;

        let volPhrase: string;
        if (starterVolRounded != null && benchVolRounded != null) {
          const tied = sameCategory && starterVolRounded === benchVolRounded;
          volPhrase =
            `${sideFact(starterName, starterVolRounded, starterPlayed, starterStat.label)}; ` +
            `${sideFact(benchName, benchVolRounded, benchPlayed, benchStat.label)}` +
            (tied
              ? ` -- identical at ${starterVolRounded} ${starterStat.label}; state plainly (in your ` +
                `own varied words) that they're tied at that exact number, don't just call it "close"`
              : sameCategory
              ? ` -- a razor-thin gap between those two whole numbers`
              : ` -- different positions with different roles (${starterStat.label} vs. ` +
                `${benchStat.label}), but projected close enough in value that it's a genuine toss-up ` +
                `-- do not call these two numbers "equal" or "identical" since they're not the same ` +
                `stat, just note both usage numbers and that the decision is close`);
        } else {
          volPhrase = `${starterName} and ${benchName} have nearly identical expected usage this week`;
        }

        allCandidates.push({
          roster_id: m.roster_id,
          manager_name: manager,
          week,
          slot,
          starterId,
          benchId: best.id,
          starterName,
          benchName,
          volLabel: starterStat.label,
          starterVol,
          benchVol,
          margin,
          prompt:
            `${manager}'s ${slot} spot in Week ${week} is a real coin flip between the current ` +
            `starter (${starterName}) and the top bench option (${benchName}). ${volPhrase}.` +
            (starterPlayed || benchPlayed
              ? ` One side's game has already happened -- state their number as a real fact, past ` +
                `tense. The other's hasn't happened yet -- state their number as a projection, future ` +
                `tense. Always state both numbers.`
              : ` Neither side has played yet -- state both projected numbers, future tense.`) +
            ` Do not mention, estimate, or invent a fantasy point total, percentage, or any decimal ` +
            `figure for anything -- every number given to you is already a whole number, use it as-is.`,
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
      starter_player_id: c.starterId,
      bench_player_id: c.benchId,
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
