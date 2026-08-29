// ingest-news — pulls NFL news from RSS feeds, dedupes by URL, tags each item
// to the players it mentions (rules half of the hybrid), scores fantasy impact,
// and upserts into `news_items`. Run on a cron (~every 15 min).
//
// Matching is two-pass:
//   1. Full-name match  ("jalen hurts")            -> always accepted
//   2. Last-name match  ("hurts") + team in text   -> accepted, disambiguated
// Team context lets us resolve duplicate surnames (the two "Josh Allen"s).
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanBody, capBody, fetchArticleBody, pool } from "../_shared/article.ts";

// Free RSS/Atom feeds. Dead/empty feeds are skipped gracefully, so adding a few
// extra candidates is low-risk. `weight` is a per-source reliability bump added
// to impact_score — transaction/beat sources that break roster-relevant news
// (RotoWire, Pro Football Rumors) rank higher than general national feeds.
// `tier` is the DEFAULT reporter persona for a source; per-item content can
// override it (see classifyReporter). Social/influencer content currently
// emerges from content signals — dedicated social sources (X/Reddit/podcasts)
// are a separate ingestion pipeline, TODO.
type ReporterTier = "breaking" | "beat" | "social";
const FEEDS: { source: string; url: string; weight: number; tier: ReporterTier }[] = [
  // --- breaking / beat / transactions (highest signal for fantasy) ---
  { source: "RotoWire NFL", url: "https://www.rotowire.com/rss/news.php?sport=NFL", weight: 3, tier: "breaking" },
  { source: "Pro Football Rumors", url: "https://www.profootballrumors.com/feed", weight: 3, tier: "breaking" },
  { source: "NFL Trade Rumors", url: "https://nfltraderumors.co/feed/", weight: 2, tier: "breaking" },
  { source: "ProFootballTalk", url: "https://profootballtalk.nbcsports.com/feed/", weight: 2, tier: "beat" },
  // --- national / general coverage ---
  { source: "ESPN NFL", url: "https://www.espn.com/espn/rss/nfl/news", weight: 1, tier: "beat" },
  { source: "CBS Sports NFL", url: "https://www.cbssports.com/rss/headlines/nfl/", weight: 1, tier: "beat" },
  { source: "Yahoo Sports NFL", url: "https://sports.yahoo.com/nfl/rss.xml", weight: 1, tier: "beat" },
  { source: "ProFootballNetwork", url: "https://www.profootballnetwork.com/feed/", weight: 1, tier: "beat" },
];

// Team context signals (lowercase, no digits — normalize strips them).
const TEAM_SIGNALS: Record<string, string[]> = {
  ARI: ["arizona", "cardinals"], ATL: ["atlanta", "falcons"],
  BAL: ["baltimore", "ravens"], BUF: ["buffalo", "bills"],
  CAR: ["carolina", "panthers"], CHI: ["chicago", "bears"],
  CIN: ["cincinnati", "bengals"], CLE: ["cleveland", "browns"],
  DAL: ["dallas", "cowboys"], DEN: ["denver", "broncos"],
  DET: ["detroit", "lions"], GB: ["green bay", "packers"],
  HOU: ["houston", "texans"], IND: ["indianapolis", "colts"],
  JAX: ["jacksonville", "jaguars"], KC: ["kansas city", "chiefs"],
  LAC: ["chargers"], LAR: ["rams"], LV: ["las vegas", "raiders"],
  MIA: ["miami", "dolphins"], MIN: ["minnesota", "vikings"],
  NE: ["new england", "patriots"], NO: ["new orleans", "saints"],
  NYG: ["giants"], NYJ: ["jets"], PHI: ["philadelphia", "eagles"],
  PIT: ["pittsburgh", "steelers"], SEA: ["seattle", "seahawks"],
  SF: ["san francisco", "niners"], TB: ["tampa bay", "buccaneers", "bucs"],
  TEN: ["tennessee", "titans"], WAS: ["washington", "commanders"],
};

const IMPACT_KEYWORDS: { re: RegExp; weight: number }[] = [
  { re: /\b(out|inactive|ruled out|injured reserve|ir)\b/i, weight: 5 },
  { re: /\b(injury|injured|questionable|doubtful|hamstring|acl|concussion)\b/i, weight: 4 },
  { re: /\b(trade|traded|signs|signed|released|waived|cut)\b/i, weight: 4 },
  { re: /\b(starter|starting|promoted|benched|demoted|snap)\b/i, weight: 3 },
  { re: /\b(touchdown|targets|carries|return|practice|activated)\b/i, weight: 2 },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function tag(s: string, name: string): string | null {
  const m = s.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : null;
}

// Atom feeds put the URL in <link href="..."/> rather than <link>text</link>.
function atomLink(block: string): string | null {
  // Prefer rel="alternate"; fall back to the first href.
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return decodeEntities(alt[1]).trim();
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return any ? decodeEntities(any[1]).trim() : null;
}

// Classify an item into a visual/news category (priority order matters).
// Drives the owned, typographic category backdrop in the app — no photos.
// Priority order: most specific first. Richer taxonomy => less visual repetition.
const TYPE_RULES: { type: string; re: RegExp }[] = [
  { type: "injury", re: /\b(injur\w*|questionable|doubtful|ruled out|out for|hamstring|acl|mcl|concussion|ankle|knee|groin|injured reserve|\bir\b|placed on|carted)\b/i },
  { type: "suspension", re: /\b(suspend\w*|suspension|arrest\w*|fined|violat\w*|ppd|legal|charged)\b/i },
  { type: "return", re: /\b(activat\w*|returns?|cleared|reinstated|back at practice|off ir|designated to return|full participant)\b/i },
  { type: "trade", re: /\b(trade\w*|dealt|acquir\w*|shipped|swap|blockbuster)\b/i },
  { type: "contract", re: /\b(extension|holdout|hold-in|restructure\w*|guaranteed|deal worth|contract|franchise tag|payday|salary)\b/i },
  { type: "draft", re: /\b(draft\w*|rookie|prospect|undrafted|\bpick\b|first-round|combine|udfa)\b/i },
  { type: "coaching", re: /\b(coach\w*|hired|fired|coordinator|play-?caller|scheme|staff|promoted to)\b/i },
  { type: "signing", re: /\b(sign\w*|agree\w*|released|waiv\w*|\bcut\b|free agent|claimed|workout)\b/i },
  { type: "breakout", re: /\b(breakout|sleeper|league-?winner|buy low|smash|upside|must-draft|post-hype|value pick)\b/i },
  { type: "usage", re: /\b(target\w*|carries|snap\w*|starter|starting|benched|demoted|depth chart|role|workload|touches|reps|first-team)\b/i },
  { type: "camp", re: /\b(camp|minicamp|otas?|preseason|training camp|practice|joint practice)\b/i },
  { type: "ranking", re: /\b(rank\w*|tiers?|\badp\b|projection\w*|start.{0,4}sit|top \d+|cheat sheet|mock)\b/i },
  { type: "rumor", re: /\b(rumor\w*|report\w*|speculation|buzz|could|might|reportedly|expected to)\b/i },
];

function classifyType(text: string): string {
  for (const r of TYPE_RULES) if (r.re.test(text)) return r.type;
  return "general";
}

// Reporter persona routing. Content signals win over the source's default tier:
//   breaking — a transaction/injury just happened (facts, urgency)
//   social   — opinion/rankings/hot-take/vibes (the influencer's lane)
//   beat     — everything else: analysis, usage, practice reports
const BREAKING_RE =
  /\b(ruled out|inactive|placed on|injured reserve|\bir\b|activat\w*|reinstated|signs?|signed|releas\w*|waiv\w*|traded|trade|acquir\w*|suspend\w*|claimed|elevated|designated to return|out for the (season|year)|carted|to undergo surgery|done for the)\b/i;
const SOCIAL_RE =
  /\b(rank\w*|tiers?|start.{0,4}sit|sleeper|breakout|bold|must-draft|buy low|sell high|hot take|overrated|underrated|hype|cheat sheet|mock draft|\badp\b|love\/hate|stock (up|down)|believe|hot seat)\b/i;

function classifyReporter(text: string, newsType: string, tier: ReporterTier): ReporterTier {
  if (BREAKING_RE.test(text)) return "breaking";
  if (SOCIAL_RE.test(text) || newsType === "ranking" || newsType === "breakout") return "social";
  return tier;
}

// Prefer the FULL article body when the feed ships it (WordPress content:encoded
// / Atom content) — most feeds only put a one-line teaser in <description>.
function bestBody(block: string, kind: "rss" | "atom"): string {
  const full = kind === "rss" ? tag(block, "content:encoded") : tag(block, "content");
  const teaser = kind === "rss" ? tag(block, "description") : tag(block, "summary");
  const chosen = (full && full.trim().length > 0) ? full : (teaser ?? "");
  return cleanBody(chosen);
}

function parseFeed(xml: string) {
  const items: { title: string; link: string; pubDate: string | null; desc: string }[] = [];

  // RSS 2.0: <item>…</item>
  for (const b of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
    const title = tag(b, "title");
    const link = tag(b, "link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: tag(b, "pubDate"),
      desc: bestBody(b, "rss"),
    });
  }

  // Atom: <entry>…</entry> (link is an attribute, date is <updated>/<published>).
  for (const b of xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []) {
    const title = tag(b, "title");
    const link = atomLink(b);
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: tag(b, "published") ?? tag(b, "updated"),
      desc: bestBody(b, "atom"),
    });
  }

  return items;
}

// Feeds that ship only a teaser — we fetch the real article text for these
// (see the enrichment step in the handler). fetchArticleBody lives in _shared.
const ENRICH_SOURCES = new Set(["ESPN NFL", "CBS Sports NFL", "Yahoo Sports NFL", "ProFootballNetwork"]);
const ENRICH_MIN_BODY = 400;      // shorter than this = teaser worth enriching
const MAX_ARTICLE_FETCHES = 20;   // per run, to bound execution time

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("sleeper_player_id, search_name, team")
    .not("team", "is", null);
  if (pErr) return new Response(`players load failed: ${pErr.message}`, { status: 500 });
  if (!players?.length) {
    return new Response("players table empty — run sync-players first", { status: 412 });
  }

  // Build full-name and last-name indexes once.
  const fullIndex: { name: string; id: string }[] = [];
  const lastIndex = new Map<string, { id: string; team: string }[]>();
  for (const p of players) {
    const sn = (p.search_name ?? "").trim();
    if (sn.length >= 6) fullIndex.push({ name: ` ${sn} `, id: p.sleeper_player_id });
    const last = sn.split(" ").pop() ?? "";
    if (last.length >= 4 && p.team) {
      const arr = lastIndex.get(last) ?? [];
      arr.push({ id: p.sleeper_player_id, team: p.team });
      lastIndex.set(last, arr);
    }
  }

  // Match players in a text (full-name always; last-name only with team context).
  // Reused to re-tag against the full article body after enrichment.
  const matchIds = (text: string): string[] => {
    const hay = ` ${normalize(text)} `;
    const teamsInText = new Set<string>();
    for (const [abbr, sigs] of Object.entries(TEAM_SIGNALS)) {
      for (const s of sigs) { if (hay.includes(` ${s} `)) { teamsInText.add(abbr); break; } }
    }
    const out = new Set<string>();
    for (const { name, id } of fullIndex) if (hay.includes(name)) out.add(id);
    for (const [last, cands] of lastIndex) {
      if (!hay.includes(` ${last} `)) continue;
      for (const c of cands) if (teamsInText.has(c.team)) out.add(c.id);
    }
    return [...out];
  };

  const rows: any[] = [];
  // Cross-feed dedupe: the same story breaks on several feeds. Keep the first
  // occurrence (feeds are ordered highest-signal first), drop later duplicates
  // that share a normalized headline.
  const seenHeadlines = new Set<string>();
  for (const feed of FEEDS) {
    let xml: string;
    try {
      const r = await fetch(feed.url, { headers: { "User-Agent": "LeagueTap/0.1" } });
      if (!r.ok) continue;
      xml = await r.text();
    } catch (_) {
      continue;
    }

    for (const it of parseFeed(xml)) {
      const headlineKey = normalize(it.title);
      if (headlineKey.length >= 10) {
        if (seenHeadlines.has(headlineKey)) continue;
        seenHeadlines.add(headlineKey);
      }

      const haystack = ` ${normalize(`${it.title} ${it.desc}`)} `;

      // Which teams are referenced in this item?
      const teamsInText = new Set<string>();
      for (const [abbr, sigs] of Object.entries(TEAM_SIGNALS)) {
        for (const s of sigs) {
          if (haystack.includes(` ${s} `)) { teamsInText.add(abbr); break; }
        }
      }

      const matched = new Set<string>();

      // Pass 1: full-name matches (high precision).
      for (const { name, id } of fullIndex) {
        if (haystack.includes(name)) matched.add(id);
      }

      // Pass 2: last-name matches, only when the player's team is in the text.
      for (const [last, candidates] of lastIndex) {
        if (!haystack.includes(` ${last} `)) continue;
        for (const c of candidates) {
          if (teamsInText.has(c.team)) matched.add(c.id);
        }
      }

      let impact = 0;
      for (const k of IMPACT_KEYWORDS) if (k.re.test(it.title + " " + it.desc)) impact += k.weight;
      impact += Math.min(matched.size, 3);
      impact += feed.weight; // source-reliability bump

      const fullText = `${it.title} ${it.desc}`;
      const newsType = classifyType(fullText);
      rows.push({
        source: feed.source,
        url: it.link,
        headline: it.title,
        body: capBody(it.desc),
        published_at: it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString(),
        player_ids: [...matched],
        impact_score: impact,
        news_type: newsType,
        reporter_type: classifyReporter(fullText, newsType, feed.tier),
      });
    }
  }

  if (!rows.length) {
    return new Response(JSON.stringify({ ok: true, ingested: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enrich thin, roster-relevant items from teaser-only feeds with the real
  // article text. Bounded + graceful: skip items we already stored full, cap the
  // number of fetches per run, and fall back to the teaser on any failure.
  const enrichable = rows.filter((r) =>
    ENRICH_SOURCES.has(r.source) && r.player_ids.length && r.body.length < ENRICH_MIN_BODY);
  if (enrichable.length) {
    const { data: existing } = await supabase
      .from("news_items").select("url, body").in("url", enrichable.map((r) => r.url));
    const alreadyFull = new Set(
      (existing ?? []).filter((e: any) => (e.body?.length ?? 0) >= ENRICH_MIN_BODY).map((e: any) => e.url));
    const todo = enrichable.filter((r) => !alreadyFull.has(r.url)).slice(0, MAX_ARTICLE_FETCHES);
    await pool(todo, 5, async (r) => {
      const full = await fetchArticleBody(r.url);
      if (full && full.length > r.body.length) {
        r.body = full;
        // Re-tag against the full article so player_ids reflect the real text,
        // not just the teaser (list/roundup articles name many players).
        r.player_ids = [...new Set([...(r.player_ids ?? []), ...matchIds(full)])];
      }
    });
  }

  // Upsert in batches — a single large write can get the DB connection reset.
  const BATCH = 500;
  let ingested = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("news_items")
      .upsert(slice, { onConflict: "url" });
    if (error) {
      return new Response(`news upsert failed: ${error.message}`, { status: 500 });
    }
    ingested += slice.length;
  }

  return new Response(
    JSON.stringify({ ok: true, ingested }),
    { headers: { "Content-Type": "application/json" } },
  );
});
