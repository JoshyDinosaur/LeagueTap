// prewarm-feeds — calls get-league-feed once per tracked league so the
// LeagueTap home feed is cached before anyone opens the app. Replaces a
// single hardcoded league_id in cron with a fan-out over every league
// someone has actually loaded (see track-league) -- adding a new league to
// the app is enough on its own to bring it into this warm-cache cadence,
// no cron change needed.
//
// Input: none (cron calls this with an empty body).
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

  const { data, error } = await supabase.from("tracked_leagues").select("league_id");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const leagueIds = (data ?? []).map((r) => r.league_id as string);
  if (leagueIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no tracked leagues" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const feedUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-league-feed`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const results = await Promise.all(leagueIds.map(async (leagueId) => {
    try {
      const res = await fetch(feedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ league_id: leagueId }),
      });
      return { league_id: leagueId, ok: res.ok, status: res.status };
    } catch (e) {
      return { league_id: leagueId, ok: false, error: String(e) };
    }
  }));

  return new Response(JSON.stringify({ ok: true, leagues: results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
