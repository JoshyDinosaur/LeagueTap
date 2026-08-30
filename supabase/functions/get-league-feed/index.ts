// get-league-feed — the LeagueTap tab (league-wide news, own screen).
// League-wide NFL news ordered by RECENCY, with each blurb recontextualized to
// name the affected league manager + fantasy team.
//
// Input (POST JSON): { "league_id": "..." }
// Output: { ok, items: [ { id, headline, news_type, published_at,
//                          affected:[{player,position,manager}],
//                          blurb, action, severity, confidence, timeframe,
//                          relevance (0-100), reasoning, tags[],
//                          reporter / reporter_name (persona voice) } ] }
// Each blurb is written in its reporter persona's voice + temperature, routed
// from news_items.reporter_type (set at ingest).
//
// Option A upgrade (mirrors get-feed's grounding fixes, without get-feed's
// per-team roster role/scarcity/matchup richness -- this is league-wide
// scouting content, not "your team" advice, so there's no single viewer
// roster to hang that context on):
//   - disambiguation table: every player named in the article, resolved to
//     authoritative team/position, so the model never confuses two athletes.
//   - "subject" field written FIRST, grounding the take on the correct
//     affected player + manager before the blurb is written.
//   - passage-focused article body (extractPassages/capBody) instead of the
//     raw full body, matching get-feed's cost/noise profile.
//   - full structured-output schema (confidence/timeframe/relevance/
//     reasoning/tags) so the client can rank/filter Trending the same way
//     it ranks/filters the team feed.
//
// Secrets: ANTHROPIC_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractPassages, capBody, FEED_MAX } from "../_shared/article.ts";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
// Bump when the blurb prompt/schema changes -- folds into the cache key so
// existing cached blurbs regenerate with the new shape.
const BLURB_VERSION = "v3";
const BLURB_COUNT = 15;
const MAX_CONCURRENCY = 8;

// Same vocabularies as get-feed, so Trending and the team feed rank/filter
// identically on the client.
const ACTIONS = [
  "Start", "Must Start", "Sit", "Bench", "Add", "Waiver Claim", "Drop", "Hold",
  "Stash", "Handcuff", "Stream", "Buy Low", "Sell High", "Trade Away", "Pivot", "Monitor",
] as const;
const SEVERITIES = ["high", "medium", "low"] as const;
const CONFIDENCES = ["high", "medium", "low"] as const;
const TIMEFRAMES = ["now", "this_week", "rest_of_season", "dynasty"] as const;
const TAGS = [
  "opportunity", "risk", "volume", "role_change", "injury", "matchup",
  "value", "regression", "upside", "depth", "snap_share", "target_share",
] as const;

export type Blurb = {
  text: string;
  action: string | null;
  severity: string | null;
  confidence: string | null;
  timeframe: string | null;
  relevance: number | null;
  reasoning: string | null;
  tags: string[];
};

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

// A player named in the article, resolved to authoritative team/position — the
// disambiguation set so the model never puts players on the wrong team.
type MentionedPlayer = { name: string; position: string | null; team: string | null };

const BLURB_TOOL = {
  name: "league_take",
  description: "Record your recontextualized, ranked take for the league home feed.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description:
          "FIRST, before anything else: name the affected fantasy manager + player + their NFL team, " +
          "from the AUTHORITATIVE context (not the article). Grounds you so you don't confuse them " +
          "with other athletes the article merely compares them to.",
      },
      blurb: {
        type: "string",
        description:
          "ONE line (max 28 words) in your reporter voice, built around the affected fantasy team " +
          "(named naturally), that adds an angle the HEADLINE doesn't — implication, sharp read, or " +
          "humor. Never a restatement. No preamble, no hashtags.",
      },
      action: { type: "string", enum: [...ACTIONS], description: "The single most relevant move for the affected manager." },
      severity: { type: "string", enum: [...SEVERITIES], description: "How much this shakes up that team: high, medium, or low." },
      confidence: {
        type: "string", enum: [...CONFIDENCES],
        description: "How sure you are given the news (rumor/uncertain => lower).",
      },
      timeframe: {
        type: "string", enum: [...TIMEFRAMES],
        description: "When it matters: now (immediate), this_week (lineup), rest_of_season, or dynasty (long-term).",
      },
      relevance: {
        type: "integer", minimum: 0, maximum: 100,
        description:
          "Signal-to-noise score for the LEAGUE audience. 80–100: league-shaking (a title contender's " +
          "starter). 50–79: notable, worth knowing. 20–49: minor. 0–19: noise — score low so the app " +
          "can filter it out.",
      },
      reasoning: {
        type: "string",
        description: "Brief why behind the take (max 20 words). The fantasy logic, not a headline restatement.",
      },
      tags: {
        type: "array", items: { type: "string", enum: [...TAGS] },
        description: "1–3 tags categorizing the angle.",
      },
    },
    required: ["subject", "blurb", "action", "severity", "confidence", "timeframe", "relevance"],
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

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function keyFor(newsId: string, sig: string): Promise<string> {
  const basis = "lg|" + BLURB_VERSION + "|" + newsId + "|" + sig;
  return "lg:" + (await sha(basis)).slice(0, 28);
}

async function leagueBlurb(
  headline: string,
  body: string,
  affected: { player: string; position: string | null; manager: string }[],
  mentioned: MentionedPlayer[],
  persona: Persona,
): Promise<Blurb> {
  const who = affected
    .map((a) => `${a.player} (${a.position ?? "?"}) is on "${a.manager}"`)
    .join("; ");
  // Disambiguation table — every player the article names, with authoritative team.
  const mentionedLine = mentioned.length
    ? `Players named in the article (AUTHORITATIVE teams — these are DIFFERENT people on ` +
      `DIFFERENT teams; never merge or confuse them): ` +
      mentioned.map((m) => `${m.name} (${m.position ?? "?"}, ${m.team ?? "FA"})`).join("; ") + ".\n"
    : "";
  const prompt =
    `${persona.voice}\n\n` +
    `AUTHORITATIVE league context — current and correct; TRUST IT over the article and over your ` +
    `own assumptions about which team a player is on: affected fantasy team(s): ${who}.\n` +
    `${mentionedLine}` +
    `Headline: ${headline}\nDetails: ${body}\n\n` +
    `Your take is about the affected league player(s) above and ONLY them. Any OTHER athletes named ` +
    `are comparisons or context — never assume they are teammates, share a role, or a situation with ` +
    `your player. State no relationship the context doesn't make explicit.\n\n` +
    `Readers ALREADY see the headline — do NOT restate it. First set "subject" to lock onto the right ` +
    `manager + player + team, then write ONE line in your voice that adds an angle the headline can't, ` +
    `recontextualized around the affected fantasy team (name it naturally). If your line could be ` +
    `swapped for the headline, it failed — rewrite it. Score relevance honestly (most news is low). ` +
    `Call the league_take tool.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
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

  const pick = <T extends readonly string[]>(v: unknown, set: T) =>
    (typeof v === "string" && (set as readonly string[]).includes(v)) ? (v as string) : null;
  const rel = Number(input.relevance);
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((t: unknown) => (TAGS as readonly string[]).includes(t as string)).slice(0, 3)
    : [];

  return {
    text,
    action: pick(input.action, ACTIONS),
    severity: pick(input.severity, SEVERITIES),
    confidence: pick(input.confidence, CONFIDENCES),
    timeframe: pick(input.timeframe, TIMEFRAMES),
    relevance: Number.isFinite(rel) ? Math.max(0, Math.min(100, Math.round(rel))) : null,
    reasoning: typeof input.reasoning === "string" ? input.reasoning.trim() || null : null,
    tags,
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

  // Resolve player display info for everything affected (across ALL items, not
  // just the ones that get a blurb -- every item's `affected` field needs it).
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

  // ---- RETRIEVAL: disambiguation table for the candidates ----
  // Every player named across candidate articles, resolved to authoritative
  // team/position -- same fix as get-feed for Haiku confusing similarly-named
  // or merely-compared athletes.
  const mentionedIds = [...new Set(candidates.flatMap((c) => (c.it.player_ids ?? []) as string[]))];
  const { data: mentionedRows } = mentionedIds.length
    ? await supabase.from("players").select("sleeper_player_id, full_name, position, team").in("sleeper_player_id", mentionedIds)
    : { data: [] as any[] };
  const mMap = new Map((mentionedRows ?? []).map((p: any) => [p.sleeper_player_id, p]));
  const mentionedFor = (it: any): MentionedPlayer[] =>
    ((it.player_ids ?? []) as string[])
      .map((id) => mMap.get(id)).filter(Boolean)
      .map((p: any) => ({ name: p.full_name, position: p.position ?? null, team: p.team ?? null }))
      .slice(0, 8);

  const keyed = await Promise.all(candidates.map(async (c) => {
    const persona = personaFor(c.it.reporter_type);
    const mentioned = mentionedFor(c.it);
    // Fold mentioned players' teams into the key so trades bust the cache,
    // same as the affected managers/players.
    const mSig = ((c.it.player_ids ?? []) as string[])
      .map((id) => `${id}:${mMap.get(id)?.team ?? ""}`).sort().join(",");
    const sig = persona.type + "|" + c.affected.map((a) => `${a.manager}:${a.player}`).sort().join(",") + "|" + mSig;
    return { ...c, persona, mentioned, key: await keyFor(c.it.id, sig) };
  }));

  const cacheMap = new Map<string, Blurb>();
  if (keyed.length) {
    const { data: cached } = await supabase
      .from("blurbs")
      .select("news_item_id, roster_context_key, text, action, severity, confidence, timeframe, relevance, reasoning, tags")
      .in("news_item_id", keyed.map((k) => k.it.id));
    for (const row of cached ?? []) {
      cacheMap.set(`${row.news_item_id}|${row.roster_context_key}`, {
        text: row.text, action: row.action ?? null, severity: row.severity ?? null,
        confidence: row.confidence ?? null, timeframe: row.timeframe ?? null,
        relevance: row.relevance ?? null, reasoning: row.reasoning ?? null, tags: row.tags ?? [],
      });
    }
  }
  const misses = keyed.filter((k) => !cacheMap.has(`${k.it.id}|${k.key}`));
  const generated = await pmap(misses, MAX_CONCURRENCY, async (m) => {
    try {
      // Passage-focused article body (around the affected players' names),
      // capped to FEED_MAX -- same cost/noise profile as get-feed, instead of
      // the raw full body.
      const body = m.it.body ?? "";
      const names = m.affected.map((a: { player: string }) => a.player);
      const focused = capBody(extractPassages(body, names) ?? body, FEED_MAX);
      const blurb = await leagueBlurb(m.it.headline, focused, m.affected, m.mentioned, m.persona);
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
      confidence: g.blurb!.confidence, timeframe: g.blurb!.timeframe,
      relevance: g.blurb!.relevance, reasoning: g.blurb!.reasoning, tags: g.blurb!.tags,
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
      confidence: blurb?.confidence ?? null,
      timeframe: blurb?.timeframe ?? null,
      relevance: blurb?.relevance ?? null,
      reasoning: blurb?.reasoning ?? null,
      tags: blurb?.tags ?? [],
      reporter: persona.type,
      reporter_name: persona.name,
    };
  });

  return new Response(JSON.stringify({ ok: true, items }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
