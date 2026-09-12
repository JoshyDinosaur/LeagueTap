// get-tossup-detail — the page ANY Ledger card opens into (blunder, steal,
// streak, or toss_up -- name is legacy from when this only handled toss-ups).
//
// Two halves:
//   (1) record: this manager's aggregated Ledger history in this league --
//       how many blunders (benched a better score) vs steals (bench pick
//       would've been big) they've had, plus their most recent entries, so
//       any one card isn't shown in a vacuum.
//   (2) articles: the most relevant news/blurbs tagged to the two players
//       behind THIS specific decision (starter vs. bench option), when the
//       row has them. toss_up, blunder, and steal rows always have a pair
//       (ledger-report computes one for each); streak rows are a multi-week
//       pattern with no single pair, so this section is simply omitted for
//       those. Both halves' entries also carry a stat_comparison -- each
//       player's real box-score stats (never fantasy points), computed once
//       by ledger-report -- for the detail page's grid, when present.
//
// NOTE: this is NOT a toss-up-specific win/loss grade -- it's the manager's
// overall weekly-decision record (from ledger-report), the data that
// already exists. Grading each toss-up's own actual outcome (did they start
// the player who scored more) is a separate, not-yet-built feature.
//
// Input (POST JSON): { "ledger_item_id": "..." }
// Output: { ok, tossup: {...}, articles: [...], record: {...} }
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARTICLE_LIMIT = 8;
const RECENT_LIMIT = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let ledgerItemId = "";
  try {
    ledgerItemId = String((await req.json()).ledger_item_id ?? "");
  } catch (_) { /* ignore */ }
  if (!ledgerItemId) {
    return new Response(JSON.stringify({ error: "expected { ledger_item_id }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data: item, error: itemErr } = await supabase
    .from("ledger_items")
    .select(
      "id, league_id, season, week, roster_id, manager_name, headline, text, " +
      "category, starter_player_id, bench_player_id, stat_comparison",
    )
    .eq("id", ledgerItemId)
    .maybeSingle();
  if (itemErr || !item) {
    return new Response(JSON.stringify({ error: itemErr?.message ?? "ledger item not found" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const playerIds = [item.starter_player_id, item.bench_player_id].filter(Boolean) as string[];

  // ---- (1) Articles relevant to the two players in this toss-up ----
  let articles: any[] = [];
  if (playerIds.length) {
    const [{ data: players }, { data: news }] = await Promise.all([
      supabase.from("players").select("sleeper_player_id, full_name, position, team")
        .in("sleeper_player_id", playerIds),
      supabase.from("news_items")
        .select("id, source, url, headline, published_at, player_ids, impact_score")
        .overlaps("player_ids", playerIds)
        .order("impact_score", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(ARTICLE_LIMIT * 2), // overfetch; we'll trim after joining blurbs
    ]);
    const playerById = new Map((players ?? []).map((p: any) => [p.sleeper_player_id, p]));
    const newsIds = (news ?? []).map((n: any) => n.id);

    // Reuse whatever blurb text already exists for these articles (generated
    // by get-feed for this manager's own "For Your Team" feed) rather than
    // spending a fresh Haiku call -- these players are already on this
    // manager's roster, so a cached take usually already exists. Multiple
    // roster-context rows can exist per article; keep the highest-relevance
    // one.
    const blurbByNews = new Map<string, any>();
    if (newsIds.length) {
      const { data: blurbs } = await supabase
        .from("blurbs")
        .select("news_item_id, text, action, relevance")
        .in("news_item_id", newsIds);
      for (const b of blurbs ?? []) {
        const prev = blurbByNews.get(b.news_item_id);
        if (!prev || (b.relevance ?? -1) > (prev.relevance ?? -1)) blurbByNews.set(b.news_item_id, b);
      }
    }

    articles = (news ?? []).slice(0, ARTICLE_LIMIT).map((n: any) => {
      const taggedIds = (n.player_ids ?? []).filter((id: string) => playerIds.includes(id));
      const taggedPlayers = taggedIds.map((id: string) => playerById.get(id)).filter(Boolean)
        .map((p: any) => ({ id: p.sleeper_player_id, name: p.full_name, position: p.position, team: p.team }));
      const b = blurbByNews.get(n.id);
      return {
        id: n.id,
        source: n.source,
        url: n.url,
        headline: n.headline,
        published_at: n.published_at,
        players: taggedPlayers,
        blurb: b?.text ?? null,
        action: b?.action ?? null,
        relevance: b?.relevance ?? null,
      };
    });
  }

  // ---- (2) This manager's aggregated Ledger record in this league ----
  const { data: history } = await supabase
    .from("ledger_items")
    .select("week, category, headline, text, points_left_on_bench, stat_comparison")
    .eq("league_id", item.league_id)
    .eq("roster_id", item.roster_id)
    .order("week", { ascending: false });

  const counts: Record<string, number> = { blunder: 0, steal: 0, streak: 0, toss_up: 0 };
  for (const h of history ?? []) counts[h.category] = (counts[h.category] ?? 0) + 1;
  const weeksTracked = new Set((history ?? []).map((h: any) => h.week)).size;

  let tendency: string;
  if (counts.blunder === 0 && counts.steal === 0) {
    tendency = "No graded lineup decisions yet this season.";
  } else if (counts.blunder > counts.steal) {
    tendency = `More blunders (${counts.blunder}) than steals (${counts.steal}) this season -- ` +
      `bench calls have cost more than they've paid off.`;
  } else if (counts.steal > counts.blunder) {
    tendency = `More steals (${counts.steal}) than blunders (${counts.blunder}) this season -- ` +
      `bench calls have paid off more than they've cost.`;
  } else {
    tendency = `Even record: ${counts.blunder} blunder(s), ${counts.steal} steal(s) this season.`;
  }

  const recent = (history ?? [])
    .filter((h: any) => h.category === "blunder" || h.category === "steal")
    .slice(0, RECENT_LIMIT)
    .map((h: any) => ({
      week: h.week, category: h.category, headline: h.headline, text: h.text,
      points_left_on_bench: h.points_left_on_bench,
      stat_comparison: h.stat_comparison ?? null,
    }));

  return new Response(JSON.stringify({
    ok: true,
    tossup: {
      id: item.id, week: item.week, manager_name: item.manager_name,
      headline: item.headline, text: item.text, category: item.category,
      stat_comparison: item.stat_comparison ?? null,
    },
    articles,
    record: {
      manager_name: item.manager_name,
      weeks_tracked: weeksTracked,
      blunders: counts.blunder,
      steals: counts.steal,
      streaks: counts.streak,
      tendency,
      recent,
    },
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});
