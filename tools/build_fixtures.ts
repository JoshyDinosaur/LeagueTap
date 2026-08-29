// build_fixtures.ts — pull REAL news items from the live RSS feeds, parsed and
// player-matched EXACTLY like ingest-news, and write a variety of them to
// tools/fixtures.json for blurb_lab.ts to tune against.
//
// RUN (occasionally, to refresh the sample set):
//   deno run --allow-net --allow-read --allow-write tools/build_fixtures.ts
//   deno run ... tools/build_fixtures.ts --count 14      # how many to keep
//
// It faithfully mirrors ingest-news: same feeds, same parse (title -> headline,
// description stripped/decoded/sliced to 2000 -> body), same news_type + player
// matching. Only items that match a real player are kept (those are the ones
// that get a blurb in production).

import { cleanBody, capBody, fetchArticleBody } from "../supabase/functions/_shared/article.ts";

const FEEDS: { source: string; url: string }[] = [
  { source: "RotoWire NFL", url: "https://www.rotowire.com/rss/news.php?sport=NFL" },
  { source: "Pro Football Rumors", url: "https://www.profootballrumors.com/feed" },
  { source: "NFL Trade Rumors", url: "https://nfltraderumors.co/feed/" },
  { source: "ProFootballTalk", url: "https://profootballtalk.nbcsports.com/feed/" },
  { source: "ESPN NFL", url: "https://www.espn.com/espn/rss/nfl/news" },
  { source: "CBS Sports NFL", url: "https://www.cbssports.com/rss/headlines/nfl/" },
  { source: "Yahoo Sports NFL", url: "https://sports.yahoo.com/nfl/rss.xml" },
  { source: "ProFootballNetwork", url: "https://www.profootballnetwork.com/feed/" },
];

const TEAM_SIGNALS: Record<string, string[]> = {
  ARI: ["arizona", "cardinals"], ATL: ["atlanta", "falcons"], BAL: ["baltimore", "ravens"],
  BUF: ["buffalo", "bills"], CAR: ["carolina", "panthers"], CHI: ["chicago", "bears"],
  CIN: ["cincinnati", "bengals"], CLE: ["cleveland", "browns"], DAL: ["dallas", "cowboys"],
  DEN: ["denver", "broncos"], DET: ["detroit", "lions"], GB: ["green bay", "packers"],
  HOU: ["houston", "texans"], IND: ["indianapolis", "colts"], JAX: ["jacksonville", "jaguars"],
  KC: ["kansas city", "chiefs"], LAC: ["chargers"], LAR: ["rams"], LV: ["las vegas", "raiders"],
  MIA: ["miami", "dolphins"], MIN: ["minnesota", "vikings"], NE: ["new england", "patriots"],
  NO: ["new orleans", "saints"], NYG: ["giants"], NYJ: ["jets"], PHI: ["philadelphia", "eagles"],
  PIT: ["pittsburgh", "steelers"], SEA: ["seattle", "seahawks"], SF: ["san francisco", "niners"],
  TB: ["tampa bay", "buccaneers", "bucs"], TEN: ["tennessee", "titans"], WAS: ["washington", "commanders"],
};

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
const classifyType = (t: string) => TYPE_RULES.find((r) => r.re.test(t))?.type ?? "general";

const normalize = (t: string) =>
  t.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

function decodeEntities(s: string): string {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
function tag(s: string, name: string): string | null {
  const m = s.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : null;
}
function atomLink(b: string): string | null {
  const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return decodeEntities(alt[1]).trim();
  const any = b.match(/<link[^>]*href=["']([^"']+)["']/i);
  return any ? decodeEntities(any[1]).trim() : null;
}
// Feeds that ship only a teaser — we fetch the real article text for these
// (cleanBody / capBody / fetchArticleBody come from the shared article module).
const ENRICH_SOURCES = new Set(["ESPN NFL", "CBS Sports NFL", "Yahoo Sports NFL", "ProFootballNetwork"]);
const ENRICH_MIN_BODY = 400;

// Prefer the FULL article body (content:encoded / Atom content) over the teaser.
function bestBody(block: string, kind: "rss" | "atom"): string {
  const full = kind === "rss" ? tag(block, "content:encoded") : tag(block, "content");
  const teaser = kind === "rss" ? tag(block, "description") : tag(block, "summary");
  return cleanBody((full && full.trim().length > 0) ? full : (teaser ?? ""));
}

function parseFeed(xml: string) {
  const items: { title: string; url: string; desc: string }[] = [];
  for (const b of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
    const title = tag(b, "title");
    const url = tag(b, "link");
    if (!title || !url) continue;
    items.push({ title, url, desc: bestBody(b, "rss") });
  }
  for (const b of xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []) {
    const title = tag(b, "title");
    const url = atomLink(b);
    if (!title || !url) continue;
    items.push({ title, url, desc: bestBody(b, "atom") });
  }
  return items;
}

type FxPlayer = { full_name: string; position: string; team: string; role: "starter" | "bench"; teammates?: string[] };
type Mentioned = { name: string; position: string; team: string };
type Fixture = { label: string; route: string; source: string; url: string; headline: string; body: string; players: FxPlayer[]; mentioned: Mentioned[] };

async function main() {
  const args = Deno.args;
  const count = args.includes("--count") ? Number(args[args.indexOf("--count") + 1]) : 12;

  console.log("Fetching Sleeper player map…");
  const players = await (await fetch("https://api.sleeper.app/v1/players/nfl")).json() as Record<string, any>;
  const RELEVANT = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
  const fullIndex: { name: string; disp: string; pos: string; team: string }[] = [];
  const lastIndex = new Map<string, { disp: string; pos: string; team: string }[]>();
  const roomByKey = new Map<string, { name: string; ord: number }[]>(); // team|pos depth chart
  for (const p of Object.values(players)) {
    const pos = p?.position, team = p?.team;
    if (!pos || !RELEVANT.has(pos) || !team) continue;
    const disp = p.full_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    const sn = normalize(disp);
    if (sn.length >= 6) fullIndex.push({ name: ` ${sn} `, disp, pos, team });
    const last = sn.split(" ").pop() ?? "";
    if (last.length >= 4) {
      const arr = lastIndex.get(last) ?? [];
      arr.push({ disp, pos, team });
      lastIndex.set(last, arr);
    }
    const rk = `${team}|${pos}`;
    const room = roomByKey.get(rk) ?? [];
    room.push({ name: disp, ord: Number(p.depth_chart_order) || 99 });
    roomByKey.set(rk, room);
  }
  for (const arr of roomByKey.values()) arr.sort((a, b) => a.ord - b.ord);
  const teammatesFor = (name: string, team: string, pos: string): string[] =>
    (roomByKey.get(`${team}|${pos}`) ?? []).map((x) => x.name).filter((n) => n !== name).slice(0, 3);

  // Match all named players in a text — used to re-tag the disambiguation list
  // against the full article after enrichment (mirrors ingest-news re-tag).
  const matchMentioned = (text: string): Mentioned[] => {
    const hay = ` ${normalize(text)} `;
    const teamsInText = new Set<string>();
    for (const [abbr, sigs] of Object.entries(TEAM_SIGNALS)) {
      if (sigs.some((s) => hay.includes(` ${s} `))) teamsInText.add(abbr);
    }
    const out: Mentioned[] = [];
    const added = new Set<string>();
    for (const { name, disp, pos, team } of fullIndex) {
      if (hay.includes(name) && !added.has(disp)) { out.push({ name: disp, position: pos, team }); added.add(disp); }
    }
    for (const [last, cands] of lastIndex) {
      if (!hay.includes(` ${last} `)) continue;
      for (const c of cands) if (teamsInText.has(c.team) && !added.has(c.disp)) { out.push({ name: c.disp, position: c.pos, team: c.team }); added.add(c.disp); }
    }
    return out;
  };

  console.log("Fetching RSS feeds…");
  const raw: { source: string; title: string; url: string; desc: string }[] = [];
  await Promise.all(FEEDS.map(async (f) => {
    try {
      const r = await fetch(f.url, { headers: { "User-Agent": "LeagueTap/0.1" } });
      if (!r.ok) return;
      for (const it of parseFeed(await r.text())) raw.push({ source: f.source, ...it });
    } catch (_) { /* skip dead feed */ }
  }));

  // Match players (full-name, then last-name+team) exactly like ingest-news.
  const seen = new Set<string>();
  const matched: Fixture[] = [];
  for (const it of raw) {
    const hkey = normalize(it.title);
    if (hkey.length < 10 || seen.has(hkey)) continue;
    seen.add(hkey);
    const hay = ` ${normalize(`${it.title} ${it.desc}`)} `;
    const teamsInText = new Set<string>();
    for (const [abbr, sigs] of Object.entries(TEAM_SIGNALS)) {
      if (sigs.some((s) => hay.includes(` ${s} `))) teamsInText.add(abbr);
    }
    const hits: FxPlayer[] = [];
    const added = new Set<string>();
    for (const { name, disp, pos, team } of fullIndex) {
      if (hay.includes(name) && !added.has(disp)) { hits.push({ full_name: disp, position: pos, team, role: "starter" }); added.add(disp); }
    }
    for (const [last, cands] of lastIndex) {
      if (!hay.includes(` ${last} `)) continue;
      for (const c of cands) {
        if (teamsInText.has(c.team) && !added.has(c.disp)) { hits.push({ full_name: c.disp, position: c.pos, team: c.team, role: "starter" }); added.add(c.disp); }
      }
    }
    if (!hits.length) continue;
    hits.forEach((h, i) => (h.role = i === 0 ? "starter" : "bench")); // first match = starter, rest = bench
    const kept = hits.slice(0, 3);
    for (const h of kept) h.teammates = teammatesFor(h.full_name, h.team, h.position);
    matched.push({
      label: classifyType(`${it.title} ${it.desc}`),
      route: "beat", // just a display hint; the lab runs all personas
      source: it.source, // which RSS feed this came from
      url: it.url, // link to the original article
      headline: it.title,
      body: capBody(it.desc), // EXACT shape/length ingest-news stores
      players: kept,
      // Disambiguation table: every player the article names, authoritative team.
      mentioned: hits.map((h) => ({ name: h.full_name, position: h.position, team: h.team })).slice(0, 8),
    });
  }

  // Pick for VARIETY: one per category first, then fill.
  const byCat = new Map<string, Fixture[]>();
  for (const f of matched) (byCat.get(f.label) ?? byCat.set(f.label, []).get(f.label)!).push(f);
  const picked: Fixture[] = [];
  for (const arr of byCat.values()) if (picked.length < count) picked.push(arr[0]);
  for (const f of matched) { if (picked.length >= count) break; if (!picked.includes(f)) picked.push(f); }

  // Fetch full article text for the teaser-only feeds (matches ingest-news).
  const toEnrich = picked.filter((f) => ENRICH_SOURCES.has(f.source) && f.body.length < ENRICH_MIN_BODY);
  if (toEnrich.length) {
    console.log(`Fetching full text for ${toEnrich.length} teaser-only articles…`);
    for (const f of toEnrich) {
      const full = await fetchArticleBody(f.url);
      if (full && full.length > f.body.length) {
        f.body = full;
        // Union players named in the full article into the disambiguation list.
        const seen2 = new Set(f.mentioned.map((m) => m.name));
        for (const m of matchMentioned(full)) if (!seen2.has(m.name)) { f.mentioned.push(m); seen2.add(m.name); }
        f.mentioned = f.mentioned.slice(0, 12);
      }
    }
  }

  const out = new URL("./fixtures.json", import.meta.url);
  await Deno.writeTextFile(out, JSON.stringify(picked, null, 2));
  console.log(`\nWrote ${picked.length} fixtures to tools/fixtures.json`);
  for (const f of picked) {
    console.log(
      `  [${f.label.padEnd(10)}] ${f.source.padEnd(20)} body ${String(f.body.length).padStart(4)}c  ·  ` +
      `${f.headline.slice(0, 54).padEnd(54)}  ·  ${f.players.map((p) => p.full_name).join(", ")}`,
    );
  }
  console.log(`\nNow tune: deno run --allow-net --allow-env --allow-read tools/blurb_lab.ts`);
}

main();
