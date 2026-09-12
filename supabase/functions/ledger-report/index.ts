// ledger-report — "The Ledger": a recurring persona (not tied to any real
// news article) that reads weekly_lineups history and writes up notable
// start/sit outcomes — bench blunders, smart calls, and multi-week streaks.
// Output is stored in ledger_items, its own table, and surfaced by
// get-ledger-feed as a distinct section on the LeagueTap tab (not merged
// into the news-sourced feed).
//
// v1 approximation: a "blunder" compares a manager's best bench score
// against their WORST starter's score that week, regardless of position —
// a simplification (not position-matched), good enough for a fun recap, not
// a precise "optimal lineup" calculator. That worst-starter/best-bench pair
// is also persisted as starter_player_id/bench_player_id, so the card's
// detail page (get-tossup-detail) can show the articles behind that exact
// call, same as it does for toss_up rows. steal/streak rows leave both
// null -- they're whole-lineup or multi-week calls, not a single pair.
//
// Multi-league: cron calls this with no league_id, and it fans out across
// every row in tracked_leagues (see track-league) instead of one hardcoded
// league. Passing an explicit { league_id } still works, for manual testing.
//
// Input (POST JSON): { "league_id"?: "..." }
// Secrets: ANTHROPIC_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const BLUNDER_THRESHOLD = 8; // points left on the bench to count as a real story
const STEAL_MIN_STARTER_POINTS = 20; // a big week, worth calling out

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

type Candidate = {
  roster_id: number;
  manager_name: string;
  week: number;
  category: "blunder" | "steal" | "streak";
  points_left_on_bench: number | null;
  prompt: string;
  // Only set for "blunder": the specific worst-starter/best-bench pair that
  // caused it, so the card can later open get-tossup-detail's article view.
  // steal/streak are whole-lineup or multi-week calls with no single pair.
  starterId?: string;
  benchId?: string;
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
    const starters: any[] = t.starters ?? [];
    const manager = t.manager_name || "A manager";
    if (starters.length && t.best_bench_points != null) {
      const worstStarter = starters.reduce(
        (worst: any, p: any) => (!worst || p.points < worst.points ? p : worst),
        null,
      );
      const bench: any[] = t.bench ?? [];
      const bestBench = bench.reduce(
        (best: any, p: any) => (!best || p.points > best.points ? p : best),
        null,
      );
      const gap = (t.best_bench_points ?? 0) - (worstStarter?.points ?? 0);
      if (worstStarter && gap >= BLUNDER_THRESHOLD) {
        candidates.push({
          roster_id: t.roster_id,
          manager_name: manager,
          week: t.week,
          category: "blunder",
          points_left_on_bench: gap,
          prompt:
            `${manager} started ${worstStarter.name} (${worstStarter.points} pts) in Week ${t.week} ` +
            `while ${t.best_bench_player} sat on the bench and scored ${t.best_bench_points} pts — ` +
            `${gap.toFixed(1)} points left on the bench.`,
          starterId: worstStarter.player_id ? String(worstStarter.player_id) : undefined,
          benchId: bestBench?.player_id ? String(bestBench.player_id) : undefined,
        });
      }
    }
    if ((t.starter_points ?? 0) >= STEAL_MIN_STARTER_POINTS) {
      candidates.push({
        roster_id: t.roster_id,
        manager_name: manager,
        week: t.week,
        category: "steal",
        points_left_on_bench: null,
        prompt:
          `${manager}'s starting lineup put up ${t.starter_points} points in Week ${t.week} — one of ` +
          `the best-managed rosters in the league this week.`,
      });
    }
  }

  if (week >= 3) {
    const { data: recent } = await supabase
      .from("weekly_lineups")
      .select("roster_id, manager_name, week, best_bench_points, starters")
      .eq("league_id", leagueId)
      .eq("is_final", true)
      .lt("week", week)
      .gte("week", week - 3);
    const byRoster: Record<number, any[]> = {};
    for (const r of recent ?? []) (byRoster[r.roster_id] ??= []).push(r);
    for (const [rosterId, history] of Object.entries(byRoster)) {
      let blunderWeeks = 0;
      for (const h of history) {
        const worst = (h.starters ?? []).reduce(
          (w: any, p: any) => (!w || p.points < w.points ? p : w),
          null,
        );
        if (worst && (h.best_bench_points ?? 0) - worst.points >= BLUNDER_THRESHOLD) blunderWeeks++;
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
