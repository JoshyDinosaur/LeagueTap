// sync-players — fetches the full Sleeper NFL player map and upserts the
// fantasy-relevant players into the `players` table. Run once daily (cron).
//
// Sleeper: GET /v1/players/nfl  (~5MB, do NOT call from the client)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Positions we care about for fantasy news matching. This isn't just
// "who can be rostered" -- it's also the authoritative-team lookup that
// get-league-feed/ingest-news use to stop the AI writer from guessing a
// player's team from stale training data. So it needs to cover individual
// defensive players too (DE, DT, LB, CB, S, ...): they show up by name in
// fantasy news constantly (trades, injuries, pass-rush matchups) even in
// leagues that don't roster IDPs, and without an authoritative row here
// the model falls back on whatever team it last "remembers" them on.
const RELEVANT_POSITIONS = new Set([
  "QB", "RB", "WR", "TE", "K", "DEF",
  "DL", "DE", "DT", "LB", "OLB", "ILB", "EDGE",
  "DB", "CB", "S", "FS", "SS",
]);

// Normalize a name for substring matching against news text:
// lowercase, collapse whitespace, strip punctuation (keep letters/spaces).
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) {
    return new Response(`Sleeper fetch failed: ${res.status}`, { status: 502 });
  }
  const players = await res.json() as Record<string, any>;

  const rows: any[] = [];
  for (const [id, p] of Object.entries(players)) {
    const pos = p?.position as string | undefined;
    const team = p?.team as string | undefined;
    // Keep skill-position players who are on a team (active, fantasy-relevant).
    if (!pos || !RELEVANT_POSITIONS.has(pos)) continue;
    if (!team) continue;

    const fullName =
      (p?.full_name as string | undefined) ??
      `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
    if (!fullName) continue;

    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    rows.push({
      sleeper_player_id: id,
      full_name: fullName,
      search_name: normalize(fullName),
      team,
      position: pos,
      // Richer fantasy context for high-signal blurb curation.
      injury_status: (p?.injury_status as string | undefined) || null,
      depth_chart_order: num(p?.depth_chart_order),
      depth_chart_position: (p?.depth_chart_position as string | undefined) || null,
      age: num(p?.age),
      years_exp: num(p?.years_exp),
      status: (p?.status as string | undefined) || null,
      number: num(p?.number),
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert in batches to stay within payload limits.
  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("players")
      .upsert(slice, { onConflict: "sleeper_player_id" });
    if (error) {
      return new Response(`Upsert failed: ${error.message}`, { status: 500 });
    }
    upserted += slice.length;
  }

  return new Response(
    JSON.stringify({ ok: true, upserted }),
    { headers: { "Content-Type": "application/json" } },
  );
});
