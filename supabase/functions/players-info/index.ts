// players-info — resolve Sleeper player_ids to display info (name/position/team).
// Input (POST JSON): { "player_ids": ["4035", ...] }
// Output: { ok, players: { "<id>": { name, position, team } } }
//
// Used by the Gameplan tab to label matchup lineups without shipping the 5MB
// Sleeper player map to the client.

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

  let ids: string[] = [];
  try {
    const body = await req.json();
    ids = [...new Set((body.player_ids ?? []).map((x: unknown) => String(x)))];
  } catch (_) {
    return new Response(JSON.stringify({ error: "expected { player_ids: [...] }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { data } = await supabase
    .from("players")
    .select("sleeper_player_id, full_name, position, team")
    .in("sleeper_player_id", ids);

  const players: Record<string, any> = {};
  for (const p of data ?? []) {
    players[p.sleeper_player_id] = {
      name: p.full_name, position: p.position, team: p.team,
    };
  }

  return new Response(JSON.stringify({ ok: true, players }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
