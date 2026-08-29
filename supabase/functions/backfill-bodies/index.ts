// backfill-bodies — one-off: enrich EXISTING teaser-only news_items (CBS/ESPN/
// Yahoo) with full article text, the same way ingest-news does for new items.
// Fetches the article URL, extracts schema.org JSON-LD articleBody (fallback:
// <p> text), and updates the row's body. Bounded + graceful.
//
// Run: POST with optional { "limit": 100 }. Re-run to keep going.
//   curl -X POST .../functions/v1/backfill-bodies -H "Authorization: Bearer <key>" \
//     -H "Content-Type: application/json" -d '{"limit":100}'
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchArticleBody, pool } from "../_shared/article.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const ENRICH_SOURCES = ["ESPN NFL", "CBS Sports NFL", "Yahoo Sports NFL", "ProFootballNetwork"];
const MIN_BODY = 400;
const CONCURRENCY = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let limit = 100;
  try { const b = await req.json(); if (b.limit != null) limit = Number(b.limit); } catch (_) { /* defaults */ }

  // Pull recent teaser-only rows; filter to thin, roster-relevant ones client-side
  // (PostgREST can't filter by string length).
  const { data, error } = await supabase
    .from("news_items")
    .select("id, url, body, player_ids, source")
    .in("source", ENRICH_SOURCES)
    .order("published_at", { ascending: false })
    .limit(600);
  if (error) return new Response(`query failed: ${error.message}`, { status: 500 });

  const todo = (data ?? [])
    .filter((r: any) => (r.player_ids?.length ?? 0) > 0 && (r.body?.length ?? 0) < MIN_BODY)
    .slice(0, limit);

  let enriched = 0;
  await pool(todo, CONCURRENCY, async (r: any) => {
    const full = await fetchArticleBody(r.url);
    if (full && full.length > (r.body?.length ?? 0)) {
      const { error: uErr } = await supabase.from("news_items").update({ body: full }).eq("id", r.id);
      if (!uErr) {
        enriched++;
        // Bust any cached blurbs for this item so get-feed regenerates from the
        // fuller body (blurbs are cached by news item, not by body text).
        await supabase.from("blurbs").delete().eq("news_item_id", r.id);
      }
    }
  });

  return new Response(
    JSON.stringify({ ok: true, scanned: todo.length, enriched }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
