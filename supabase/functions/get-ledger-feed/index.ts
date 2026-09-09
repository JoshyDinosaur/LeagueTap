// get-ledger-feed — returns The Ledger's recent entries for the LeagueTap
// tab's dedicated Ledger section. Read-only; entries themselves are written
// by ledger-report.
//
// Input (POST JSON): { "league_id": "..." }
// Output: { ok, items: [ { id, week, manager_name, headline, text,
//                          category, points_left_on_bench, created_at,
//                          roster_id, season, starter_player_id,
//                          bench_player_id } ] }
// starter_player_id/bench_player_id are only ever set on category='toss_up'
// rows -- feeds get-tossup-detail (the "why this toss-up + this manager's
// record" page a card taps into).
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (!leagueId) {
    return new Response(JSON.stringify({ error: "expected { league_id }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("ledger_items")
    .select(
      "id, week, manager_name, headline, text, category, points_left_on_bench, " +
      "created_at, roster_id, season, starter_player_id, bench_player_id",
    )
    .eq("league_id", leagueId)
    .order("week", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, items: data ?? [] }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
