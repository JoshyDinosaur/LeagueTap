// get-league-feed — the LeagueTap home tab.
// League-wide NFL news ordered by RECENCY, with each blurb recontextualized to
// name the affected league manager + fantasy team (a new Haiku prompt).
//
// Input (POST JSON): { "league_id": "..." }
// Output: { ok, items: [ { id, headline, news_type, published_at,
//                          affected:[{player,position,manager}],
//                          blurb, action (Start/Sit/…), severity (high|medium|low),
//                          reporter / reporter_name (persona voice) } ] }
// Each blurb is written in its reporter persona's voice + temperature, routed
// from news_items.reporter_type (set at ingest).
//
// Secrets: ANTHROPIC_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const BLURB_COUNT = 15;
const MAX_CONCURRENCY = 8;

const ACTIONS = ["Start", "Sit", "Add", "Drop", "Hold", "Stash", "Trade", "Monitor"] as const;
const SEVERITIES = ["high", "medium", "low"] as const;

export type Blurb = { text: string; action: string | null; severity: string | null };

// Reporter personas — same registry shape as get-feed. The persona swaps voice +
// temperature only; the league framing (naming the affected team) lives in the
// prompt. Routed by news_items.reporter_type set at ingest.
type Persona = { type: string; name: string; temperature: number; voice: string };
const PERSONAS: Record<string, Persona> = {
  breaking: {
    type: "breaking", name: "Breaking Desk", temperature: 0.2,
    voice:
      "You are the Breaking Desk — fast and sharp. One declarative line on what this means for the " +
      "affected fantasy team, with a wry edge. Facts only; the bite is in the framing. " +
      "(e.g. 'Marcus just watched his RB1's only competition get cut — crisis averted.')",
  },
  beat: {
    type: "beat", name: "The Beat", temperature: 0.55,
    voice:
      "You are The Beat — you catch the angle others skim past. One genuinely useful read on how " +
      "this reshapes the affected team's outlook. The 'huh, hadn't thought of that.'",
  },
  social: {
    type: "social", name: "The Voice", temperature: 0.9,
    voice:
      "You are The Voice narrating the league group chat — actually funny. Playful shade at the " +
      "affected manager, a vivid take, screenshot-worthy. True, but make the chat laugh. " +
      "(e.g. 'Tyler's title hopes now ride on a tight end who's been Questionable since spring.')",
  },
};
const personaFor = (reporterType: string | null): Persona =>
  (reporterType && PERSONAS[reporterType]) || PERSONAS.beat;

const BLURB_TOOL = {
  name: "league_take",
  description: "Record your recontextualized take for the league home feed.",
  input_schema: {
    type: "object",
    properties: {
      blurb: {
        type: "string",
        description:
          "ONE line (max 28 words) in your reporter voice, built around the affected fantasy team " +
          "(named naturally), that adds an angle the HEADLINE doesn't — implication, sharp read, or " +
          "humor. Never a restatement. No preamble, no hashtags.",
      },
      action: { type: "string", enum: [...ACTIONS], description: "The single most relevant move for the affected manager." },
      severity: { type: "string", enum: [...SEVERITIES], description: "How much this shakes up that team: high, medium, or low." },
    },
    required: ["blurb", "action", "severity"],
  },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function keyFor(newsId: string, affectedKeys: string[], personaType: string): Promise<string> {
  // "v2" tracks the blurb prompt/voice version so cached blurbs regenerate.
  const basis = "lg|v2|" + personaType + "|" + newsId + "|" + [...affectedKeys].sort().join(",");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return "lg:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 28);
}

async function leagueBlurb(
  headline: string,
  body: string,
  affected: { player: string; position: string | null; manager: string }[],
  persona: Persona,
): Promise<Blurb> {
  const who = affected
    .map((a) => `${a.player} (${a.position ?? "?"}) is on "${a.manager}"`)
    .join("; ");
  const prompt =
    `${persona.voice}\n\n` +
    `Affected league team(s): ${who}.\n` +
    `Headline: ${headline}\nDetails: ${body}\n\n` +
    `Readers ALREADY see the headline — do NOT restate it. In your voice, write ONE line that adds ` +
    `an angle the headline can't, recontextualized around the affected fantasy team (name it ` +
    `naturally). If your line could be swapped for the headline, rewrite it. Call the league_take tool.`;

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
      temperature: persona.temperature,
      tools: [BLURB_TOOL],
      tool_choice: { type: "tool", name: "league_take" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data?.content ?? []).find((b: any) => b.type === "tool_use");
  const input = block?.input ?? {};
  const text = (input.blurb ?? "").trim();
  if (!text) throw new Error("empty blurb");
  return {
    text,
    action: ACTIONS.includes(input.action) ? input.action : null,
    severity: SEVERITIES.includes(input.severity) ? input.severity : null,
  };
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
  if (!leagueId) {
    return new Response(JSON.stringify({ error: "expected { league_id }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Map every rostered player in the league to its manager / fantasy team name.
  const [rostersRes, usersRes] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  const rosters = rostersRes.ok ? await rostersRes.json() : [];
  const users = usersRes.ok ? await usersRes.json() : [];
  const nameByUser: Record<string, string> = {};
  for (const u of users) {
    nameByUser[u.user_id] = u.metadata?.team_name || u.display_name || "A team";
  }
  const ownerByPlayer: Record<string, string> = {}; // player_id -> manager/team name
  for (const r of rosters) {
    const owner = nameByUser[r.owner_id] ?? "A team";
    for (const pid of r.players ?? []) ownerByPlayer[String(pid)] = owner;
  }
  const leagueIds = Object.keys(ownerByPlayer);
  if (!leagueIds.length) {
    return new Response(JSON.stringify({ ok: true, items: [] }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // League-wide news, newest first.
  const { data: news } = await supabase
    .from("news_items")
    .select("id, source, url, headline, body, published_at, player_ids, news_type, reporter_type")
    .overlaps("player_ids", leagueIds)
    .order("published_at", { ascending: false })
    .limit(40);

  // Resolve player display info for everything affected.
  const affectedIds = new Set<string>();
  for (const it of news ?? []) {
    for (const pid of it.player_ids ?? []) if (ownerByPlayer[pid]) affectedIds.add(pid);
  }
  const { data: playerRows } = await supabase
    .from("players").select("sleeper_player_id, full_name, position")
    .in("sleeper_player_id", [...affectedIds]);
  const pMap = new Map((playerRows ?? []).map((p) => [p.sleeper_player_id, p]));

  const prepared = (news ?? []).map((it) => {
    const affected = (it.player_ids ?? [])
      .filter((pid: string) => ownerByPlayer[pid] && pMap.has(pid))
      .map((pid: string) => ({
        player: pMap.get(pid)!.full_name as string,
        position: pMap.get(pid)!.position as string | null,
        manager: ownerByPlayer[pid],
      }));
    return { it, affected };
  }).filter((x) => x.affected.length > 0);

  // Blurbs for the top N (cached).
  const candidates = prepared.slice(0, BLURB_COUNT);
  const keyed = await Promise.all(candidates.map(async (c) => {
    const persona = personaFor(c.it.reporter_type);
    return {
      ...c,
      persona,
      key: await keyFor(c.it.id, c.affected.map((a) => `${a.manager}:${a.player}`), persona.type),
    };
  }));

  const cacheMap = new Map<string, Blurb>();
  if (keyed.length) {
    const { data: cached } = await supabase
      .from("blurbs").select("news_item_id, roster_context_key, text, action, severity")
      .in("news_item_id", keyed.map((k) => k.it.id));
    for (const row of cached ?? []) {
      cacheMap.set(`${row.news_item_id}|${row.roster_context_key}`, {
        text: row.text, action: row.action ?? null, severity: row.severity ?? null,
      });
    }
  }
  const misses = keyed.filter((k) => !cacheMap.has(`${k.it.id}|${k.key}`));
  const generated = await pmap(misses, MAX_CONCURRENCY, async (m) => {
    try {
      const blurb = await leagueBlurb(m.it.headline, m.it.body ?? "", m.affected, m.persona);
      return { id: m.it.id, key: m.key, blurb };
    } catch (_) {
      return { id: m.it.id, key: m.key, blurb: null as Blurb | null };
    }
  });
  const newRows = generated.filter((g) => g.blurb);
  for (const g of newRows) cacheMap.set(`${g.id}|${g.key}`, g.blurb!);
  if (newRows.length) {
    await supabase.from("blurbs").upsert(newRows.map((g) => ({
      news_item_id: g.id, roster_context_key: g.key,
      text: g.blurb!.text, action: g.blurb!.action, severity: g.blurb!.severity,
      model: ANTHROPIC_MODEL,
    })));
  }
  const keyById = new Map(keyed.map((k) => [k.it.id, k.key]));

  const items = prepared.map(({ it, affected }) => {
    const key = keyById.get(it.id);
    const blurb = key ? cacheMap.get(`${it.id}|${key}`) ?? null : null;
    const persona = personaFor(it.reporter_type);
    return {
      id: it.id,
      source: it.source,
      url: it.url,
      headline: it.headline,
      news_type: it.news_type,
      published_at: it.published_at,
      affected: affected.slice(0, 4),
      blurb: blurb?.text ?? null,
      action: blurb?.action ?? null,
      severity: blurb?.severity ?? null,
      reporter: persona.type,
      reporter_name: persona.name,
    };
  });

  return new Response(JSON.stringify({ ok: true, items }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
