// ledger-report — "The Ledger": a recurring persona (not tied to any real
// news article) that reads weekly_lineups history and writes up notable
// start/sit outcomes — bench blunders, smart calls, and multi-week streaks.
// Output is stored in ledger_items, its own table, and surfaced by
// get-ledger-feed as a distinct section on the LeagueTap tab (not merged
// into the news-sourced feed).
//
// A "blunder" is the starter whose position-eligible bench alternative most
// outscored them that week (same position for a straight slot; any
// FLEX-eligible position for a flex slot -- see _shared/lineup_decisions.ts).
// A "steal" is the mirror image: the starter who most cleared their own
// eligible bench alternative -- the call that paid off the most. Both pairs
// are persisted as starter_player_id/bench_player_id, so the card's detail
// page (get-tossup-detail) can show the articles behind that exact call,
// same as it does for toss_up rows -- and both get a stat_comparison (each
// player's real box-score stats, never fantasy points) for the detail
// page's grid. streak rows leave both null -- they're a multi-week pattern,
// not a single pair.
//
// Multi-league: cron calls this with no league_id, and it fans out across
// every row in tracked_leagues (see track-league) instead of one hardcoded
// league. Passing an explicit { league_id } still works, for manual testing.
//
// Input (POST JSON): { "league_id"?: "..." }
// Secrets: ANTHROPIC_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { statLineFor, type StatLine } from "../_shared/position_stats.ts";
import { bestSteal, worstBlunder, type SlotPlayer } from "../_shared/lineup_decisions.ts";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const BLUNDER_THRESHOLD = 8; // points left on the bench to count as a real story
const STEAL_THRESHOLD = 15; // points a starter cleared the best bench option by, to count as a real story

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEDGER_VOICE =
  "You are The Ledger — LeagueTap's receipts-keeper. Dry, deadpan, exact. You don't gloat and you " +
  "don't console; you just state what happened and let the numbers do the roasting (or the bragging). " +
  "One or two sentences, always naming the manager and the players involved. Never generic — always " +
  "grounded in the specific numbers given.";

const LEDGER_TOOL = {
  name: "ledger_entry",
  description: "Record this week's Ledger entry.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "Short, specific headline (under 8 words)." },
      text: { type: "string", description: "The Ledger's one-or-two-sentence entry." },
    },
    required: ["headline", "text"],
  },
};

type Supabase = ReturnType<typeof createClient>;

type StatComparisonSide = { id: string; name: string; position: string | null; stats: StatLine[] };
type StatComparison = { starter: StatComparisonSide; bench: StatComparisonSide };

type Candidate = {
  roster_id: number;
  manager_name: string;
  week: number;
  category: "blunder" | "steal" | "streak";
  points_left_on_bench: number | null;
  prompt: string;
  // Set for "blunder" and "steal": the specific starter/bench pair behind
  // the call, so the card can later open get-tossup-detail's article view.
  // streak is a multi-week pattern with no single pair.
  starterId?: string;
  benchId?: string;
  statComparison?: StatComparison;
};

// Real box-score stats (never fantasy points) for the two players behind a
// blunder/steal call, for the detail page's grid. Returns undefined when
// either side has no player id, or neither side has any stat worth showing
// (e.g. a bye-week zero, or the stats fetch failed that week).
function buildStatComparison(starter: SlotPlayer, bench: SlotPlayer): StatComparison | undefined {
  if (!starter?.player_id || !bench?.player_id) return undefined;
  const starterStats = statLineFor(starter.position, starter.stats);
  const benchStats = statLineFor(bench.position, bench.stats);
  if (!starterStats.length && !benchStats.length) return undefined;
  return {
    starter: { id: String(starter.player_id), name: starter.name, position: starter.position ?? null, stats: starterStats },
    bench: { id: String(bench.player_id), name: bench.name, position: bench.position ?? null, stats: benchStats },
  };
}

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
      max_tokens: 200,
      temperature: 0.5,
      tools: [LEDGER_TOOL],
      tool_choice: { type: "tool", name: "ledger_entry" },
      messages: [{ role: "user", content: `${LEDGER_VOICE}\n\n${c.prompt}\n\nCall the ledger_entry tool.` }],
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

async function reportLeague(supabase: Supabase, leagueId: string) {
  const { data: latestRows } = await supabase
    .from("weekly_lineups")
    .select("week")
    .eq("league_id", leagueId)
    .order("week", { ascending: false })
    .limit(1);
  const week = latestRows?.[0]?.week;
  if (!week) return { league_id: leagueId, ok: true, skipped: "no lineup history yet" };

  const { data: rows } = await supabase
    .from("weekly_lineups")
    .select("*")
    .eq("league_id", leagueId)
    .eq("week", week);
  const teams = rows ?? [];

  const season = teams[0]?.season ?? String(new Date().getFullYear());
  const candidates: Candidate[] = [];

  for (const t of teams) {
    const starters: SlotPlayer[] = t.starters ?? [];
    const bench: SlotPlayer[] = t.bench ?? [];
    const manager = t.manager_name || "A manager";
    if (!starters.length || !bench.length) continue;

    const blunder = worstBlunder(starters, bench);
    if (blunder && blunder.gap >= BLUNDER_THRESHOLD) {
      const { starter, bench: alt, gap } = blunder;
      candidates.push({
        roster_id: t.roster_id,
        manager_name: manager,
        week: t.week,
        category: "blunder",
        points_left_on_bench: gap,
        prompt:
          `${manager} started ${starter.name} (${starter.points} pts) in Week ${t.week} while ` +
          `${alt.name} sat on the bench and scored ${alt.points} pts — ${gap.toFixed(1)} points left ` +
          `on the bench.`,
        starterId: starter.player_id ? String(starter.player_id) : undefined,
        benchId: alt.player_id ? String(alt.player_id) : undefined,
        statComparison: buildStatComparison(starter, alt),
      });
    }

    // Steal: the mirror of a blunder -- the starter who most CLEARED their
    // own position-eligible bench alternative, i.e. the call that paid off
    // the most. Gives steals a concrete single-player decision (the old
    // rule was just a whole-lineup point total with no pair to point at).
    const steal = bestSteal(starters, bench);
    if (steal && steal.gap >= STEAL_THRESHOLD) {
      const { starter, bench: alt, gap } = steal;
      candidates.push({
        roster_id: t.roster_id,
        manager_name: manager,
        week: t.week,
        category: "steal",
        points_left_on_bench: null,
        prompt:
          `${manager} started ${starter.name} (${starter.points} pts) in Week ${t.week} over benched ` +
          `${alt.name} (${alt.points} pts) — a call that paid off by ${gap.toFixed(1)} points.`,
        starterId: starter.player_id ? String(starter.player_id) : undefined,
        benchId: alt.player_id ? String(alt.player_id) : undefined,
        statComparison: buildStatComparison(starter, alt),
      });
    }
  }

  if (week >= 3) {
    const { data: recent } = await supabase
      .from("weekly_lineups")
      .select("roster_id, manager_name, week, starters, bench")
      .eq("league_id", leagueId)
      .eq("is_final", true)
      .lt("week", week)
      .gte("week", week - 3);
    const byRoster: Record<number, any[]> = {};
    for (const r of recent ?? []) (byRoster[r.roster_id] ??= []).push(r);
    for (const [rosterId, history] of Object.entries(byRoster)) {
      let blunderWeeks = 0;
      for (const h of history) {
        const blunder = worstBlunder(h.starters ?? [], h.bench ?? []);
        if (blunder && blunder.gap >= BLUNDER_THRESHOLD) blunderWeeks++;
      }
      if (blunderWeeks >= 2) {
        const manager = history[0]?.manager_name || "A manager";
        candidates.push({
          roster_id: Number(rosterId),
          manager_name: manager,
          week,
          category: "streak",
          points_left_on_bench: null,
          prompt:
            `${manager} has left meaningful points on the bench in ${blunderWeeks} of their last ` +
            `${history.length} weeks — a pattern, not a one-off.`,
        });
      }
    }
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
      category: c.category,
      points_left_on_bench: c.points_left_on_bench,
      starter_player_id: c.starterId ?? null,
      bench_player_id: c.benchId ?? null,
      stat_comparison: c.statComparison ?? null,
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

  const results = await Promise.all(leagueIds.map((id) => reportLeague(supabase, id)));
  return new Response(JSON.stringify({ ok: true, leagues: results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
