// get-feed — the recontextualization payoff.
//
// Input (POST JSON):
//   { "player_ids":        [...],   // YOUR roster
//     "starter_ids":       [...],   // YOUR starting lineup (optional)
//     "league_player_ids": [...],   // union of every roster in your league (optional)
//     "league_id":         "...",   // optional — unlocks scoring-aware advice
//     "week":              12 }     // optional — overrides Sleeper's current week
//
// Output (JSON): { ok, season, week, scoring, team: FeedItem[], league: FeedItem[] }
//   FeedItem.blurb is recontextualized with rich context:
//     • roster role (starter vs bench) + position scarcity
//     • injury status + depth-chart role (from players table)
//     • this-week matchup (opponent, difficulty, weather, bye — from game_context)
//     • league scoring format (PPR / superflex / TE-premium)
//   and carries structured fields the app can rank/filter on:
//     action, severity, confidence, timeframe, relevance (0–100), reasoning, tags[].
//   Each item is written in the voice of its reporter persona (reporter /
//   reporter_name), routed from news_items.reporter_type set at ingest.
//   FeedItem.my_players[] carries { id (Sleeper player id), name, position,
//   team, injury } — id + the top-level week seed the app's thumbnail art.
//
// Secrets: ANTHROPIC_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractPassages, capBody, FEED_MAX } from "../_shared/article.ts";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
// Bump when the blurb prompt/persona voices change — folds into the cache key
// so existing cached blurbs regenerate with the new voice.
const BLURB_VERSION = "v4";
const TEAM_BLURBS = 10;     // team items that get an AI blurb
const LEAGUE_BLURBS = 6;    // league items that get an AI blurb
const MAX_CONCURRENCY = 8;  // parallel Anthropic calls

// Structured-output vocabularies (the model is constrained to these).
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

// Roster depth: at or below this many rostered at a position, that position is
// "thin" — gaining/losing a body there matters more.
const SCARCE_AT: Record<string, number> = { QB: 2, RB: 4, WR: 5, TE: 2, K: 1, DEF: 1 };

// Reporter personas. The structured output contract (fantasy_take) is SHARED —
// the persona only swaps voice + sampling temperature, and which stories route
// to it (news_items.reporter_type, set at ingest). Add a 4th persona here, not
// a new tool. Temperature: cold/factual for breaking → warm for the influencer.
type Persona = { type: string; name: string; temperature: number; voice: string };
const PERSONAS: Record<string, Persona> = {
  breaking: {
    type: "breaking", name: "Breaking Desk", temperature: 0.2,
    voice:
      "You are the Breaking Desk — fast, sharp, a little wry. One declarative line on the fantasy " +
      "fallout, the kind that makes a manager exhale or curse out loud. Facts only; the edge is in " +
      "the framing, never invented details. " +
      "(e.g. 'Your starting back just inherited the whole backfield — set it and forget it.')",
  },
  beat: {
    type: "beat", name: "The Beat", temperature: 0.55,
    voice:
      "You are The Beat — you catch the angle everyone else skims past. Give ONE genuinely useful " +
      "read (a usage shift, a depth-chart ripple, a rest-of-season tell) that changes how the manager " +
      "sees this player. Aim for the 'huh, hadn't thought of that.' " +
      "(e.g. 'Quietly the only back taking third-down snaps — the PPR floor just doubled.')",
  },
  social: {
    type: "social", name: "The Voice", temperature: 0.9,
    voice:
      "You are The Voice — the league's funniest group-chat take artist. Be actually funny: a punchy " +
      "hot take, playful shade, a vivid comparison. True, but screenshot-worthy. " +
      "(e.g. 'Aiyuk wants out so bad he's basically a free agent with extra paperwork.')",
  },
};
const personaFor = (reporterType: string | null): Persona =>
  (reporterType && PERSONAS[reporterType]) || PERSONAS.beat;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SupaClient = ReturnType<typeof createClient>;

// A team's game this week (subset of the game_context cache `data` payload).
type GameInfo = {
  opp?: string;
  homeAway?: string;
  bye?: boolean;
  difficulty?: { tier?: string } | null;
  weather?: { label?: string } | null;
};

// League scoring summary used to weight advice.
type ScoringProfile = { label: string; sig: string } | null;

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Cache key = news item + matched roster + a signature of the live context that
// should invalidate a stale take (scoring, week/matchup, injury, depth, bye).
async function contextKey(newsId: string, matchedIds: string[], sig: string): Promise<string> {
  const basis = newsId + "|" + [...matchedIds].sort().join(",") + "|" + sig;
  return (await sha(basis)).slice(0, 32);
}

// Run async tasks with a concurrency cap.
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

// ---------------------------------------------------------------------------
// Blurb generation
// ---------------------------------------------------------------------------

// A player as the model sees it, with the fantasy context that sharpens advice.
type BlurbPlayer = {
  full_name: string;
  position: string | null;
  team: string | null;           // authoritative current NFL team
  role: "starter" | "bench";
  scarce: boolean;
  injury_status: string | null;
  depth_role: string | null;     // e.g. "RB1", "WR3" — depth-chart slot + order
  teammates: string[];           // same team + position, competing for touches
  age: number | null;
  years_exp: number | null;
  on_bye: boolean;
  plays_this_week: boolean;
  opponent: string | null;
  home_away: string | null;
  matchup: string | null;        // tough | medium | easy
  weather: string | null;
};

// A player named in the article, resolved to authoritative team/position — the
// disambiguation set so the model never puts players on the wrong team.
type MentionedPlayer = { name: string; position: string | null; team: string | null };

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

const BLURB_TOOL = {
  name: "fantasy_take",
  description: "Record your recontextualized, ranked take for this manager.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description:
          "FIRST, before anything else: name the ONE rostered player this take is about and their " +
          "NFL team, from the authoritative roster context (not the article). Grounds you so you " +
          "don't confuse them with other athletes the article merely compares them to.",
      },
      blurb: {
        type: "string",
        description:
          "ONE line (max 25 words) in your reporter voice about the SUBJECT player only, adding an " +
          "angle the HEADLINE doesn't — the fantasy implication, a sharp read, or genuine humor. " +
          "Never a restatement. Never claim other named players are teammates/relevant unless stated.",
      },
      action: { type: "string", enum: [...ACTIONS], description: "The single best move for the manager." },
      severity: {
        type: "string", enum: [...SEVERITIES],
        description: "How much this should change their plans.",
      },
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
          "Signal-to-noise score for THIS manager. 80–100: lineup-altering for a starter / urgent add-drop. " +
          "50–79: notable, worth knowing. 20–49: minor. 0–19: noise — score low so the app can filter it out.",
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

function describePlayer(p: BlurbPlayer): string {
  const head: string[] = [p.position ?? "?"];
  if (p.team) head.push(p.team); // authoritative current NFL team
  head.push(`your ${p.role}`);
  if (p.depth_role) head.push(p.depth_role);
  if (p.injury_status) head.push(p.injury_status);
  if (p.years_exp === 0) head.push("rookie");
  else if (p.age) head.push(`age ${p.age}`);
  let s = `${p.full_name} (${head.join(", ")})`;
  if (p.teammates.length) s += ` — shares the ${p.position ?? "position"} room with ${p.teammates.join(", ")}`;
  if (p.scarce) s += ` — thin at ${p.position ?? "this position"}`;
  if (p.on_bye) {
    s += " — ON BYE this week";
  } else if (p.plays_this_week && p.opponent) {
    const m = [`${p.home_away === "away" ? "@" : "vs"} ${p.opponent}`];
    if (p.matchup) m.push(`${p.matchup} matchup`);
    if (p.weather) m.push(p.weather);
    s += ` — this week ${m.join(", ")}`;
  }
  return s;
}

async function generateBlurb(
  headline: string,
  body: string,
  players: BlurbPlayer[],
  mentioned: MentionedPlayer[],
  scoringLabel: string | null,
  persona: Persona,
  offseason: boolean,
): Promise<Blurb> {
  const roster = players.map(describePlayer).join("; ");
  const league = scoringLabel ? `League scoring: ${scoringLabel}. ` : "";
  // Disambiguation table — every player the article names, with authoritative team.
  const mentionedLine = mentioned.length
    ? `Players named in the article (AUTHORITATIVE teams — these are DIFFERENT people on ` +
      `DIFFERENT teams; never merge or confuse them): ` +
      mentioned.map((m) => `${m.name} (${m.position ?? "?"}, ${m.team ?? "FA"})`).join("; ") + ".\n"
    : "";
  const weigh = offseason
    ? `roster value, role, depth-chart/injury, and season-long or dynasty implications`
    : `lineup role, depth, injury/depth-chart, this-week matchup, and scoring`;
  const offseasonRule = offseason
    ? `It is the OFFSEASON — games are months away. Do NOT mention upcoming matchups, this-week ` +
      `opponents, weather, or start/sit decisions. `
    : ``;
  const prompt =
    `${persona.voice}\n\n` +
    `AUTHORITATIVE roster context — current and correct; TRUST IT over the article and over your ` +
    `own assumptions about which team a player is on or their role: ${roster}.\n` +
    `${mentionedLine}${league}\n` +
    `Headline: ${headline}\nDetails: ${body}\n\n` +
    `Your take is about the rostered player(s) above and ONLY them. Any OTHER athletes named are ` +
    `comparisons or context — never assume they are teammates, share a role, a draft class, or a ` +
    `situation with your player. State no relationship the context doesn't make explicit.\n\n` +
    `${offseasonRule}The manager ALREADY sees the headline — do NOT restate it. First set "subject" ` +
    `to lock onto the right player + team, then write ONE line in your voice that adds what the ` +
    `headline can't: the fantasy implication for THEIR team, a sharp read, or a genuinely funny ` +
    `angle. Weigh ${weigh}. If your line could be swapped for the headline, it failed — rewrite it. ` +
    `Never write a position letter directly followed by a number to express a ranking or tier ` +
    `(e.g. "QB6", "RB12", "a WR2") — that shorthand is genuinely ambiguous in fantasy football ` +
    `(weekly starter tier, overall scoring rank, and depth-chart slot all look identical) and the ` +
    `reader can't tell which you mean. Say standing in plain language instead: "the No. 6 ` +
    `quarterback in fantasy scoring" or "a low-end starting QB most weeks" — never bare ` +
    `position+number shorthand. ` +
    `Score relevance honestly (most news is low). Call the fantasy_take tool.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 350,
      temperature: persona.temperature,
      tools: [BLURB_TOOL],
      tool_choice: { type: "tool", name: "fantasy_take" },
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

// ---------------------------------------------------------------------------
// Feed assembly
// ---------------------------------------------------------------------------

async function buildFeed(
  supabase: SupaClient,
  rosterIds: string[],
  blurbCount: number,
  pMap: Map<string, any>,
  starterSet: Set<string>,
  gameByTeam: Map<string, GameInfo>,
  scoring: ScoringProfile,
  offseason: boolean,
): Promise<any[]> {
  if (!rosterIds.length) return [];
  const rosterSet = new Set(rosterIds);
  // In offseason mode, drop all this-week matchup context entirely.
  if (offseason) gameByTeam = new Map();

  // Roster depth by position — drives the "you're thin at RB" scarcity signal.
  const posCount: Record<string, number> = {};
  for (const pid of rosterIds) {
    const pos = pMap.get(pid)?.position;
    if (pos) posCount[pos] = (posCount[pos] ?? 0) + 1;
  }
  const isScarce = (pos: string | null) =>
    !!pos && pos in SCARCE_AT && (posCount[pos] ?? 0) <= SCARCE_AT[pos];

  const { data: news } = await supabase
    .from("news_items")
    .select("id, source, url, headline, body, published_at, player_ids, impact_score, news_type, reporter_type")
    .overlaps("player_ids", rosterIds)
    .order("impact_score", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(40);

  const items = (news ?? []).map((it) => {
    const myIds = (it.player_ids ?? []).filter((pid: string) => rosterSet.has(pid));
    const myPlayers = myIds.map((pid: string) => pMap.get(pid)).filter(Boolean);
    return { it, myIds, myPlayers };
  });

  // Candidates that should carry a blurb (top N with a matched roster player).
  const candidates = items.slice(0, blurbCount).filter((x) => x.myIds.length);

  // ---- RETRIEVAL: authoritative context for the candidates ----
  // (1) Every player named across candidate articles (disambiguation table).
  // (2) The rostered players' depth-chart roommates (competing for touches).
  const mentionedIds = [...new Set(candidates.flatMap((c) => (c.it.player_ids ?? []) as string[]))];
  const rosterTeams = [...new Set(
    candidates.flatMap((c) => c.myIds.map((id) => pMap.get(id)?.team).filter(Boolean)),
  )] as string[];

  const [mentRes, mateRes] = await Promise.all([
    mentionedIds.length
      ? supabase.from("players").select("sleeper_player_id, full_name, position, team").in("sleeper_player_id", mentionedIds)
      : Promise.resolve({ data: [] as any[] }),
    rosterTeams.length
      ? supabase.from("players").select("full_name, position, team, depth_chart_order")
          .in("team", rosterTeams).in("position", ["QB", "RB", "WR", "TE"])
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const mMap = new Map((mentRes.data ?? []).map((p: any) => [p.sleeper_player_id, p]));
  const teammatesByKey = new Map<string, { name: string; ord: number }[]>();
  for (const p of mateRes.data ?? []) {
    const k = `${p.team}|${p.position}`;
    const arr = teammatesByKey.get(k) ?? [];
    arr.push({ name: p.full_name, ord: p.depth_chart_order ?? 99 });
    teammatesByKey.set(k, arr);
  }
  for (const arr of teammatesByKey.values()) arr.sort((a, b) => a.ord - b.ord);
  const teammatesFor = (p: any): string[] =>
    (p?.team && p?.position)
      ? (teammatesByKey.get(`${p.team}|${p.position}`) ?? [])
          .map((x) => x.name).filter((n) => n !== p.full_name).slice(0, 3)
      : [];

  // Shape a rostered player with the full fantasy context the model needs.
  const toBlurbPlayer = (pid: string): BlurbPlayer | null => {
    const p = pMap.get(pid);
    if (!p) return null;
    const g = p.team ? gameByTeam.get(p.team) : undefined;
    const depthRole = (p.depth_chart_position || p.position) && p.depth_chart_order
      ? `${p.depth_chart_position || p.position}${p.depth_chart_order}`
      : null;
    return {
      full_name: p.full_name,
      position: p.position,
      team: p.team ?? null,
      role: starterSet.has(pid) ? "starter" : "bench",
      scarce: isScarce(p.position),
      injury_status: p.injury_status ?? null,
      depth_role: depthRole,
      teammates: teammatesFor(p),
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
      on_bye: g?.bye === true,
      plays_this_week: !!g && g.bye !== true && !!g.opp,
      opponent: g?.opp ?? null,
      home_away: g?.homeAway ?? null,
      matchup: g?.difficulty?.tier ?? null,
      weather: g?.weather?.label ?? null,
    };
  };
  const mentionedFor = (it: any): MentionedPlayer[] =>
    ((it.player_ids ?? []) as string[])
      .map((id) => mMap.get(id)).filter(Boolean)
      .map((p: any) => ({ name: p.full_name, position: p.position ?? null, team: p.team ?? null }))
      .slice(0, 8);

  // A compact signature of the context that should bust a cached blurb.
  const playerSig = (pid: string): string => {
    const p = pMap.get(pid);
    if (!p) return pid;
    const g = p.team ? gameByTeam.get(p.team) : undefined;
    return [
      pid, starterSet.has(pid) ? "S" : "b", p.injury_status ?? "",
      p.depth_chart_order ?? "", g?.bye ? "BYE" : (g?.opp ?? ""), g?.difficulty?.tier ?? "",
    ].join(":");
  };

  const keyed = await Promise.all(candidates.map(async (c) => {
    const persona = personaFor(c.it.reporter_type);
    const blurbPlayers = c.myIds.map(toBlurbPlayer).filter(Boolean) as BlurbPlayer[];
    const mentioned = mentionedFor(c.it);
    // Fold mentioned players + their teams into the key so trades bust the cache.
    const mSig = ((c.it.player_ids ?? []) as string[])
      .map((id) => `${id}:${mMap.get(id)?.team ?? ""}`).sort().join(",");
    const sig = BLURB_VERSION + "|" + (offseason ? "off" : "on") + "|" + persona.type + "|" +
      (scoring?.sig ?? "") + "|" + c.myIds.map(playerSig).sort().join(",") + "|" + mSig;
    return { ...c, persona, blurbPlayers, mentioned, key: await contextKey(c.it.id, c.myIds, sig) };
  }));

  // 1) Batch cache lookup in a single query.
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

  // 2) Generate misses CONCURRENTLY.
  const misses = keyed.filter((k) => !cacheMap.has(`${k.it.id}|${k.key}`));
  const generated = await pmap(misses, MAX_CONCURRENCY, async (m) => {
    try {
      // Feed the model the passage(s) around the subject player from ANYWHERE in
      // the (full) article, capped to FEED_MAX — not a truncated wall of text.
      const body = m.it.body ?? "";
      const focused = capBody(extractPassages(body, m.blurbPlayers.map((p) => p.full_name)) ?? body, FEED_MAX);
      const blurb = await generateBlurb(m.it.headline, focused, m.blurbPlayers, m.mentioned, scoring?.label ?? null, m.persona, offseason);
      return { id: m.it.id, key: m.key, blurb };
    } catch (_) {
      return { id: m.it.id, key: m.key, blurb: null as Blurb | null };
    }
  });
  const newRows = generated.filter((g) => g.blurb);
  for (const g of newRows) cacheMap.set(`${g.id}|${g.key}`, g.blurb!);
  if (newRows.length) {
    await supabase.from("blurbs").upsert(
      newRows.map((g) => ({
        news_item_id: g.id, roster_context_key: g.key,
        text: g.blurb!.text, action: g.blurb!.action, severity: g.blurb!.severity,
        confidence: g.blurb!.confidence, timeframe: g.blurb!.timeframe,
        relevance: g.blurb!.relevance, reasoning: g.blurb!.reasoning, tags: g.blurb!.tags,
        model: ANTHROPIC_MODEL,
      })),
    );
  }

  const keyById = new Map(keyed.map((k) => [k.it.id, k.key]));
  return items.map(({ it, myPlayers }) => {
    const key = keyById.get(it.id);
    const blurb = key ? cacheMap.get(`${it.id}|${key}`) ?? null : null;
    const persona = personaFor(it.reporter_type);
    return {
      id: it.id,
      source: it.source,
      url: it.url,
      headline: it.headline,
      published_at: it.published_at,
      impact_score: it.impact_score,
      news_type: it.news_type,
      reporter: persona.type,
      reporter_name: persona.name,
      my_players: myPlayers.map((p: any) => ({
        // id = Sleeper player id — the app seeds each article's generative
        // thumbnail on it (player + week), so keep it stable and present.
        id: p.sleeper_player_id,
        name: p.full_name, position: p.position, team: p.team, injury: p.injury_status ?? null,
      })),
      blurb: blurb?.text ?? null,
      action: blurb?.action ?? null,
      severity: blurb?.severity ?? null,
      confidence: blurb?.confidence ?? null,
      timeframe: blurb?.timeframe ?? null,
      relevance: blurb?.relevance ?? null,
      reasoning: blurb?.reasoning ?? null,
      tags: blurb?.tags ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Context loaders (scoring + matchup)
// ---------------------------------------------------------------------------

// Derive a human scoring label + cache signature from a Sleeper league.
async function loadScoring(leagueId: string): Promise<ScoringProfile> {
  try {
    const r = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
    if (!r.ok) return null;
    const lg = await r.json();
    const ss = lg?.scoring_settings ?? {};
    const rec = Number(ss.rec ?? 0);
    const pprLabel = rec >= 1 ? "Full PPR" : rec >= 0.5 ? "Half PPR" : "Standard";
    const parts = [pprLabel];
    if (Number(ss.bonus_rec_te ?? 0) > 0) parts.push("TE premium");
    const positions: string[] = lg?.roster_positions ?? [];
    const superflex = positions.includes("SUPER_FLEX") ||
      positions.filter((p) => p === "QB").length > 1;
    if (superflex) parts.push("Superflex");
    const label = parts.join(", ");
    return { label, sig: label };
  } catch (_) {
    return null;
  }
}

// Read this-week game context for a set of teams from the game_context cache.
async function loadGames(
  supabase: SupaClient, season: string, week: number, teams: string[],
): Promise<Map<string, GameInfo>> {
  const out = new Map<string, GameInfo>();
  if (!teams.length) return out;
  const { data } = await supabase
    .from("game_context").select("team, data")
    .eq("season", season).eq("week", week).in("team", teams);
  for (const row of data ?? []) out.set(row.team, (row.data ?? {}) as GameInfo);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let teamIds: string[] = [];
  let leagueIds: string[] = [];
  let starterIds: string[] = [];
  let leagueId = "";
  let weekOverride: number | undefined;
  let offseason = false;
  try {
    const body = await req.json();
    teamIds = (body.player_ids ?? []).map((x: unknown) => String(x));
    leagueIds = (body.league_player_ids ?? []).map((x: unknown) => String(x));
    starterIds = (body.starter_ids ?? []).map((x: unknown) => String(x));
    leagueId = body.league_id ? String(body.league_id) : "";
    offseason = body.offseason === true;
    if (body.week != null) weekOverride = Number(body.week);
  } catch (_) {
    return new Response(JSON.stringify({ error: "expected { player_ids: [...] }" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!teamIds.length) {
    return new Response(JSON.stringify({ error: "player_ids is empty" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const allIds = [...new Set([...teamIds, ...leagueIds])];

  // Load enriched player rows, current season/week, scoring, and matchup context
  // in parallel where possible.
  const playersP = supabase
    .from("players")
    .select("sleeper_player_id, full_name, position, team, injury_status, depth_chart_order, depth_chart_position, age, years_exp")
    .in("sleeper_player_id", allIds);

  const stateP = (weekOverride != null)
    ? Promise.resolve(null as any)
    : fetch("https://api.sleeper.app/v1/state/nfl").then((r) => r.ok ? r.json() : null).catch(() => null);

  const scoringP = leagueId ? loadScoring(leagueId) : Promise.resolve(null);

  const [{ data: playerRows }, state, scoring] = await Promise.all([playersP, stateP, scoringP]);

  const pMap = new Map((playerRows ?? []).map((p) => [p.sleeper_player_id, p]));
  const starterSet = new Set(starterIds);

  const season = String(state?.season ?? new Date().getFullYear());
  const week = weekOverride ?? (state?.week > 0 ? Number(state.week) : 1);

  // Teams we need matchup context for.
  const teams = [...new Set((playerRows ?? []).map((p: any) => p.team).filter(Boolean))];
  const gameByTeam = await loadGames(supabase, season, week, teams);

  // Team and league feeds in parallel. Starter roles only apply to YOUR team;
  // the league feed treats everyone as bench (we don't know other lineups here).
  const [team, leagueRaw] = await Promise.all([
    buildFeed(supabase, teamIds, TEAM_BLURBS, pMap, starterSet, gameByTeam, scoring, offseason),
    buildFeed(supabase, leagueIds, LEAGUE_BLURBS, pMap, new Set<string>(), gameByTeam, scoring, offseason),
  ]);

  const teamItemIds = new Set(team.map((t) => t.id));
  const league = leagueRaw.filter((l) => !teamItemIds.has(l.id));

  return new Response(
    JSON.stringify({ ok: true, season, week, scoring: scoring?.label ?? null, team, league }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
