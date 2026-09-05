// track-league — records that a league is actively being used, so the
// cron-driven pipeline (snapshot-lineups, ledger-report, ledger-tossup,
// prewarm-feeds) can fan out across every league someone actually has
// open instead of a single hardcoded league_id.
//
// Called from the app (lib/services/league_session.dart's
// loadLeagueForUser) on every onboarding, league switch, and cold-start
// session restore. Fire-and-forget from the client -- a failure here
// should never block someone from using the app, it just means that
// league won't get picked up by the next cron run until the next
// successful call.
//
// Input (POST JSON): { "league_id": "...", "league_name"?: "..." }
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
  let leagueName: string | null = null;
  try {
    const body = await req.json();
    leagueId = String(body.league_id ?? "");
    leagueName = body.league_name ? String(body.league_name) : null;
  } catch (_) { /* ignore */ }
  if (!leagueId) {
    return new Response(JSON.stringify({ error: "expected { league_id }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("tracked_leagues")
    .upsert(
      { league_id: leagueId, league_name: leagueName, last_active_at: new Date().toISOString() },
      { onConflict: "league_id" },
    );
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
