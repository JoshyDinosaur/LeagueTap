// blurb_core.ts — shared blurb-tuning logic used by both the CLI (blurb_lab.ts)
// and the web UI (blurb_server.ts). Mirrors get-feed's BLURB_TOOL + persona
// prompts. No side effects — safe to import.

import { extractPassages, capBody, FEED_MAX } from "../supabase/functions/_shared/article.ts";

export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export const ACTIONS = [
  "Start", "Must Start", "Sit", "Bench", "Add", "Waiver Claim", "Drop", "Hold",
  "Stash", "Handcuff", "Stream", "Buy Low", "Sell High", "Trade Away", "Pivot", "Monitor",
] as const;
export const SEVERITIES = ["high", "medium", "low"] as const;
export const CONFIDENCES = ["high", "medium", "low"] as const;
export const TIMEFRAMES = ["now", "this_week", "rest_of_season", "dynasty"] as const;
export const TAGS = [
  "opportunity", "risk", "volume", "role_change", "injury", "matchup",
  "value", "regression", "upside", "depth", "snap_share", "target_share",
] as const;

export type Persona = { type: string; name: string; temperature: number; voice: string };

// Defaults — keep in sync with supabase/functions/get-feed/index.ts.
export const DEFAULT_PERSONAS: Record<string, Persona> = {
  breaking: {
    type: "breaking", name: "Breaking Desk", temperature: 0.2,
    voice:
      "You are the Breaking Desk — fast, sharp, a little wry. One declarative line on the fantasy " +
      "fallout, the kind that makes a manager exhale or curse out loud. Facts only; the edge is in " +
      "the framing, never invented details. " +
      "(e.g. 'Your RB1 just inherited the whole backfield — set it and forget it.')",
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

export const BLURB_TOOL = {
  name: "fantasy_take",
  description: "Record your recontextualized, ranked take for this manager.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description:
          "FIRST, before anything else: name the ONE rostered player this take is about and their " +
          "NFL team, taken from the authoritative roster context (not the article). This grounds you " +
          "so you don't confuse them with other athletes the article merely compares them to.",
      },
      blurb: {
        type: "string",
        description:
          "ONE line (max 25 words) in your reporter voice about the SUBJECT player only, adding an " +
          "angle the HEADLINE doesn't — the fantasy implication, a sharp read, or genuine humor. " +
          "Never a restatement. Never claim other named players are teammates/relevant unless stated.",
      },
      action: { type: "string", enum: [...ACTIONS] },
      severity: { type: "string", enum: [...SEVERITIES] },
      confidence: { type: "string", enum: [...CONFIDENCES] },
      timeframe: { type: "string", enum: [...TIMEFRAMES] },
      relevance: { type: "integer", minimum: 0, maximum: 100,
        description: "Signal score for THIS manager. 80–100 lineup-altering; 50–79 notable; 20–49 minor; 0–19 noise." },
      reasoning: { type: "string", description: "Brief why (max 20 words). The fantasy logic, not a headline restatement." },
      tags: { type: "array", items: { type: "string", enum: [...TAGS] }, description: "1–3 tags." },
    },
    required: ["subject", "blurb", "action", "severity", "confidence", "timeframe", "relevance"],
  },
};

export type BlurbPlayer = {
  full_name: string; position: string; team?: string | null; role: "starter" | "bench";
  scarce?: boolean; injury_status?: string | null; depth_role?: string | null;
  teammates?: string[]; // same team + position, competing for touches
  age?: number | null; years_exp?: number | null;
  matchup?: string | null; opponent?: string | null; weather?: string | null; on_bye?: boolean;
};

// A player named in the article, resolved to authoritative team/position.
export type MentionedPlayer = { name: string; position: string | null; team: string | null };

export type Fixture = {
  label: string; route: string; source?: string; url?: string; headline: string; body: string;
  players: BlurbPlayer[]; mentioned?: MentionedPlayer[]; scoring?: string;
};

export function describePlayer(p: BlurbPlayer): string {
  const head = [p.position];
  if (p.team) head.push(p.team); // authoritative current NFL team
  head.push(`your ${p.role}`);
  if (p.depth_role) head.push(p.depth_role);
  if (p.injury_status) head.push(p.injury_status);
  if (p.years_exp === 0) head.push("rookie");
  else if (p.age) head.push(`age ${p.age}`);
  let s = `${p.full_name} (${head.join(", ")})`;
  if (p.teammates?.length) s += ` — shares the ${p.position} room with ${p.teammates.join(", ")}`;
  if (p.scarce) s += ` — thin at ${p.position}`;
  if (p.on_bye) s += " — ON BYE this week";
  else if (p.opponent) {
    const m = [`vs ${p.opponent}`];
    if (p.matchup) m.push(`${p.matchup} matchup`);
    if (p.weather) m.push(p.weather);
    s += ` — this week ${m.join(", ")}`;
  }
  return s;
}

export function buildPrompt(
  headline: string, body: string, players: BlurbPlayer[],
  mentioned: MentionedPlayer[], scoringLabel: string | null, persona: Persona, offseason: boolean,
): string {
  const roster = players.map(describePlayer).join("; ");
  const league = scoringLabel ? `League scoring: ${scoringLabel}. ` : "";
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
      `opponents, weather, or start/sit decisions. ` : ``;
  return (
    `${persona.voice}\n\n` +
    `AUTHORITATIVE roster context — current and correct; TRUST IT over the article and over your ` +
    `own assumptions about which team a player is on or their role: ${roster}.\n` +
    `${mentionedLine}${league}\n` +
    `Headline: ${headline}\nDetails: ${body}\n\n` +
    `Your take is about the rostered player(s) above and ONLY them. Any OTHER athletes named in the ` +
    `article are comparisons or context — never assume they are teammates, share a role, a draft ` +
    `class, or a situation with your player. State no relationship that the context or article ` +
    `doesn't make explicit.\n\n` +
    `GROUNDING: every concrete claim in your blurb must come from the article/context above. Do NOT ` +
    `invent events, injuries, trades, suspensions, or off-field news (a "divorce", "holdout", ` +
    `"benching", etc.) that the text doesn't state. Vivid language and metaphor are welcome, but only ` +
    `if they can't be misread as a real event that didn't happen. If unsure, stay literal.\n\n` +
    `${offseasonRule}The manager ALREADY sees the headline — do NOT restate it. First set "subject" ` +
    `to lock onto the right player + team, then write ONE line in your voice that adds what the ` +
    `headline can't: the fantasy implication for THEIR team, a sharp read, or a genuinely funny ` +
    `angle. Weigh ${weigh}. If your line could be swapped for the headline, it failed — rewrite it. ` +
    `Score relevance honestly (most news is low). Call the fantasy_take tool.`
  );
}

// The passage the model actually receives — focused on the subject player(s)
// when the body is a long roundup, else the full body.
export function focusedBody(fx: Fixture): string {
  return capBody(extractPassages(fx.body, fx.players.map((p) => p.full_name)) ?? fx.body, FEED_MAX);
}

// Returns the tool_use input object (blurb + structured fields).
export async function generateBlurb(
  apiKey: string, fx: Fixture, persona: Persona, offseason: boolean,
): Promise<any> {
  const prompt = buildPrompt(fx.headline, focusedBody(fx), fx.players, fx.mentioned ?? [], fx.scoring ?? null, persona, offseason);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: 350, temperature: persona.temperature,
      tools: [BLURB_TOOL], tool_choice: { type: "tool", name: "fantasy_take" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data?.content ?? []).find((b: any) => b.type === "tool_use")?.input ?? {};
}

export async function loadFixtures(): Promise<Fixture[]> {
  const read = async (name: string): Promise<Fixture[]> => {
    try { return JSON.parse(await Deno.readTextFile(new URL(name, import.meta.url))) as Fixture[]; }
    catch (_) { return []; }
  };
  // Pinned keepers always load first and are never overwritten by build_fixtures.
  const pinned = await read("./fixtures_pinned.json");
  const built = await read("./fixtures.json");
  const merged: Fixture[] = [];
  const seen = new Set<string>();
  for (const f of [...pinned, ...built]) {
    const k = f.headline.toLowerCase();
    if (!seen.has(k)) { seen.add(k); merged.push(f); }
  }
  if (merged.length) return merged;
  {
    return [
      {
        label: "usage", route: "beat", source: "sample",
        headline: "Joe Burrow on pace for a career-high in pass attempts",
        body: "Cincinnati's run game has stalled; Burrow is throwing 42 times a game over the last month.",
        players: [{ full_name: "Joe Burrow", position: "QB", role: "starter" }],
      },
      {
        label: "rumor", route: "social", source: "sample",
        headline: "Report: 49ers fielding trade calls on WR Brandon Aiyuk",
        body: "No deal is imminent, but rivals believe San Francisco would listen on the disgruntled receiver.",
        players: [{ full_name: "Brandon Aiyuk", position: "WR", role: "starter", scarce: true }],
      },
    ];
  }
}
