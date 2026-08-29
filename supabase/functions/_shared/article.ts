// Shared article-body extraction — single source of truth for ingest-news,
// backfill-bodies, and the blurb-lab fixture builder (tools/build_fixtures.ts).
// Pure functions + fetch, no side effects, safe to import from either the edge
// runtime or the Deno CLI.

// BODY_MAX = storage/extraction ceiling: keep ~the whole article so we can match
// every named player and pull each subject's passage from ANYWHERE in it (not
// just the first N chars). Only a sanity bound against pathological pages.
export const BODY_MAX = 20000;
// FEED_MAX = the most text we actually send the model — a focused passage. The
// article stays internal; only this bounded slice reaches Haiku, so cost stays
// low no matter how long the source article is.
export const FEED_MAX = 4000;
const ARTICLE_TIMEOUT_MS = 8000;

// Strip HTML, drop common feed/site boilerplate, collapse whitespace.
export function cleanBody(html: string): string {
  return html
    // Remove embedded scripts/styles/comments WITH their contents first — this is
    // where video-player / ad-manager JSON configs live (they'd otherwise leak in
    // as text once the tags are stripped).
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    // Fallback: drop a leading JSON blob if one still slipped through as text.
    .replace(/^\s*\{[\s\S]*?\}\s*/, " ")
    .replace(/\b(the post .*? appeared first on .*?\.)/gi, " ") // WP footer
    .replace(/\b(continue reading|read more|click here)\b.*/gi, " ")
    .replace(/\b(related:|more from|more:|sign up for|subscribe to)\b.*/gi, " ") // tail boilerplate
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cap to `max` chars, backing up to the last sentence end (or space) so the
// model never gets a mid-word fragment.
export function capBody(s: string, max = BODY_MAX): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const dot = cut.lastIndexOf(". ");
  return (dot > max * 0.6 ? cut.slice(0, dot + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim();
}

// Slice from the article container's opening tag to the end of the doc — drops
// the site nav/header chrome that precedes the story (CBS/ESPN mega-menus).
export function articleScope(html: string): string {
  const m = html.match(/<(?:article|main)[\s>]|<(?:div|section)[^>]*(?:class|id)=["'][^"']*(?:article-?body|story-?body|content__body|articlebody|article__content|richtext)[^"']*["']/i);
  return m && m.index != null ? html.slice(m.index) : html;
}

// Pull schema.org articleBody out of JSON-LD (handles arrays and @graph).
export function findArticleBody(json: any): string | null {
  if (!json) return null;
  if (Array.isArray(json)) { for (const x of json) { const b = findArticleBody(x); if (b) return b; } return null; }
  if (typeof json === "object") {
    if (typeof json.articleBody === "string" && json.articleBody.length > 200) return json.articleBody;
    if (json["@graph"]) return findArticleBody(json["@graph"]);
  }
  return null;
}

// Fetch an article page and extract its body text. Prefers JSON-LD articleBody
// (clean, no boilerplate); falls back to <p> text scoped to the article element.
// Returns null on failure/timeout so callers degrade gracefully to the teaser.
export async function fetchArticleBody(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ARTICLE_TIMEOUT_MS);
    let html: string;
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LeagueTapBot/0.1; +https://leaguetap.com)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (!r.ok) return null;
      html = await r.text();
    } finally {
      clearTimeout(timer);
    }

    // 1) JSON-LD articleBody (best — clean full text, no nav/ads).
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const body = findArticleBody(JSON.parse(m[1].trim()));
        if (body) return capBody(cleanBody(body));
      } catch (_) { /* invalid JSON-LD block, skip */ }
    }

    // 2) Fallback: <p> paragraphs, scoped to the article (skips nav/header).
    const paras = [...articleScope(html).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((x) => cleanBody(x[1])).filter((t) => t.length > 40);
    const joined = paras.join(" ");
    return joined.length > 300 ? capBody(joined) : null;
  } catch (_) {
    return null; // timeout, network error, block, etc.
  }
}

// Slice out the passage(s) around given player names from a long article body,
// so the model gets the RELEVANT part instead of a truncated wall of text (e.g.
// one player's section out of a 32-team roundup). Returns null if no name is
// found — the caller then falls back to the full body.
export function extractPassages(body: string, names: string[], window = 650): string | null {
  if (!body || !names.length || body.length <= window * 2) return null;
  const lower = body.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const name of names) {
    const needles = [name.toLowerCase()];
    const last = name.trim().split(/\s+/).pop();
    if (last && last.length >= 4) needles.push(last.toLowerCase());
    // Collect EVERY occurrence of the player's name — a section can mention them
    // many times, and the important analysis is usually not at the first hit.
    const idxs = new Set<number>();
    for (const n of needles) {
      let from = 0;
      while (idxs.size < 60) {
        const i = lower.indexOf(n, from);
        if (i < 0) break;
        idxs.add(i);
        from = i + n.length;
      }
    }
    for (const idx of idxs) {
      let start = Math.max(0, idx - window);
      const priorDot = body.lastIndexOf(". ", idx);
      if (priorDot > start) start = priorDot + 2;          // snap to a sentence start
      let end = Math.min(body.length, idx + window);
      const nextDot = body.indexOf(". ", end);
      if (nextDot >= 0 && nextDot - end < 300) end = nextDot + 1; // snap to a sentence end
      ranges.push([start, end]);
    }
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] <= prev[1] + 120) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const passage = merged.map(([s, e]) => body.slice(s, e).trim()).join(" … ");
  return passage.length > 80 ? passage : null;
}

// Run async tasks with a concurrency cap.
export async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}
