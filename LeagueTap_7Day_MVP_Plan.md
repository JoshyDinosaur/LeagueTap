# LeagueTap — 7-Day MVP Build Plan

**Goal:** Ship a beta of LeagueTap — an app that recontextualizes NFL news so a fantasy manager sees it *through the lens of their own team* — to **iOS TestFlight** and **web (LeagueTap.com)** in 7 days.

**Confirmed constraints**
- **Build:** Solo developer, Claude writes most of the code.
- **Frontend:** Flutter (one codebase → iOS + Web).
- **AI approach:** Hybrid — rules tag news to your rostered players; an LLM writes the short "why this matters for *your* team" blurb.
- **League data:** Sleeper API (public, no auth, read-only) for v1. Other platforms post-launch.
- **News source:** Free / low-cost RSS feeds (recommended below).
- **Look:** Visually stunning + minimalist; the feed is framed from the perspective of *your* team.

---

## 1. The product in one sentence

Connect your Sleeper league → LeagueTap pulls live NFL news → filters to the players **on your roster** (and key opponents / waiver targets) → ranks by fantasy impact → and shows each item with a one-line "what this means for your team this week."

The magic isn't the news. It's the **recontextualization**: the same Justin Jefferson injury headline reads differently if he's your WR1, your opponent's WR1, or on nobody's roster in your league. LeagueTap renders that difference.

---

## 2. Recommended architecture

The whole stack is chosen for **one person shipping in a week**, with as little glue code and ops as possible.

| Layer | Choice | Why |
|---|---|---|
| **Client (iOS + Web)** | **Flutter** (single codebase, Flutter Web for LeagueTap.com) | One UI codebase ships both the App Store build and the website. No separate JS frontend to maintain. |
| **Backend / API** | **Supabase** (managed Postgres + Auth + Edge Functions + Cron) | Auth, database, serverless functions, and scheduled jobs in one product. Generous free tier. Far less setup than rolling your own server. |
| **Database** | **Postgres** (via Supabase) | Relational fits news ↔ players ↔ rosters cleanly. |
| **News ingestion** | **Supabase Edge Function on a cron schedule** (every 10–15 min) | Pulls RSS feeds, parses, tags players, writes to DB. No always-on server. |
| **Player tagging (the "rules" half of hybrid)** | Name/alias matching against Sleeper's player map + impact score | Deterministic, free, fast. Maps each news item to `player_ids`. |
| **Recontextualization (the "AI" half)** | **Claude Haiku** via Anthropic API, called from an Edge Function, **results cached** | Cheap, fast. Only generates the short team-relevance blurb for items that actually hit your roster. Caching keeps cost near-zero. |
| **Web hosting** | **Cloudflare Pages / Vercel / Netlify** for the Flutter Web build | Point LeagueTap.com DNS at it. Free tier fine for beta. |
| **iOS distribution** | **TestFlight** via App Store Connect | Beta channel. **Internal testing track = no Apple review, instant, up to 100 testers** — use this for the day-7 beta. |
| **Error/usage telemetry** | Sentry + Supabase logs (optional, 30 min) | Catch beta crashes. |

### Why hybrid LLM matters for cost and speed
You do **not** send every headline to the model. Pipeline:
1. **Ingest** all NFL news (cheap, no AI).
2. **Tag** each item to player_ids by name matching (no AI).
3. **Filter** to items intersecting the user's roster (no AI).
4. **Only then**, for the top N relevant items, call Claude Haiku once to write the blurb — and **cache the blurb keyed by (news_item, roster_context)** so it's generated once and reused for everyone in similar situations. A whole league of users triggers a handful of model calls, not thousands.

### Data model (minimum)
```
users            (id, sleeper_username, sleeper_user_id, active_league_id, created_at)
leagues          (id=sleeper_league_id, season, name, scoring_settings_json)
rosters          (league_id, sleeper_roster_id, owner_user_id, player_ids[])
players          (sleeper_player_id, full_name, aliases[], team, position)   -- refreshed daily from Sleeper
news_items       (id, source, url, headline, body, published_at, player_ids[], impact_score)
blurbs           (news_item_id, roster_context_key, text, model, created_at)  -- the cache
```

### Sleeper API endpoints we use (all public, no key)
- `GET /v1/user/{username}` → `user_id`
- `GET /v1/user/{user_id}/leagues/nfl/{season}` → user's leagues
- `GET /v1/league/{league_id}/rosters` → roster → `player_ids`
- `GET /v1/league/{league_id}/users` → team names/avatars
- `GET /v1/players/nfl` → full player map (~5MB; **fetch once daily and cache**, never per request)
- `GET /v1/players/nfl/trending/add` → trending adds (good offseason signal)

### Recommended free news feeds (RSS, v1)
Aggregate a handful and dedupe by URL/headline: **ESPN NFL**, **RotoWire**, **Pro Football Network**, **FFToolbox** (free), **Fantasy Alarm**, **PFF**. Start with 3–4, expand as needed. (Respect each feed's terms; RSS is for personal/display use — link back to source, don't republish full articles.)

---

## 3. The 7-day plan

> **Day 0 (do this *today*, before Day 1):**
> 1. ✅ **Apple Developer membership active** — no approval lag, we can hit TestFlight immediately.
> 2. ✅ **LeagueTap.com owned + DNS controlled** — ready to point at the web build Day 5–6.
> 3. Create accounts: **Supabase**, **Anthropic API** (get a key), web host (Cloudflare/Vercel).
> 4. Install Flutter + Xcode, confirm `flutter doctor` is clean and you can run on a simulator.
>
> **Beta goal (locked): polished, quiet June beta.** Validate the core experience now with Sleeper trending players + seeded/offseason news; time the wider public push for training camp (late July) when news flow ramps.

| Day | Focus | Deliverable at end of day |
|---|---|---|
| **1** | **Scaffold + Sleeper connect** | Flutter app runs on iOS sim + web. Supabase project + schema live. Sleeper service layer: enter username → fetch leagues → pick league → pull your roster's player_ids. |
| **2** | **News ingestion + tagging** | Cron Edge Function pulls 3–4 RSS feeds every ~15 min, dedupes, and tags each item to `player_ids` via Sleeper player-name matching. `news_items` populating in DB. |
| **3** | **Feed assembly + AI blurb** | API returns "my team feed": news items intersecting your roster, ranked by impact + recency. Claude Haiku Edge Function generates + caches the team-relevance blurb for top items. |
| **4** | **The feed UI (the wow)** | Visually stunning, minimalist feed screen rendered from *your team's* POV — roster context, impact tag, blurb, source link. Smooth, fast, beautiful empty/loading states. |
| **5** | **Onboarding + web + polish** | Clean onboarding (connect Sleeper → choose league → done). Web build deployed to a staging URL. Settings, error states, pull-to-refresh, dark mode. |
| **6** | **Ship it** | iOS build uploaded to **TestFlight internal track**; web deployed to **LeagueTap.com**. Full bug bash on device + browser. |
| **7** | **Buffer + invite testers** | Fix anything from Day 6. Invite beta testers to TestFlight + share LeagueTap.com. Telemetry on. **Beta live.** |

### Scope that is explicitly OUT of v1 (protect the timeline)
Push notifications, non-Sleeper platforms (ESPN/Yahoo), trade analyzer, start/sit advice, multi-week projections, social/comments, accounts via email/password (use Sleeper username + lightweight anonymous auth for beta), Android. All are fast-follows once the core feed proves out.

---

## 4. Deployment foolproofing (the part that usually blows up week-one launches)

**iOS / TestFlight**
- **Use the Internal Testing track for the day-7 beta.** Internal testers (anyone you add to App Store Connect, up to 100) get builds **with no Apple review** — instant. *External* testing (public link, up to 10,000) requires **Beta App Review (~24h)**; do that as a fast-follow, not on Day 7.
- Pre-reqs you'll need in App Store Connect: a **Bundle ID**, an **App record**, **signing/provisioning** (Xcode automatic signing is fine), **privacy nutrition labels**, and an **export-compliance** answer (standard HTTPS only → usually "no/exempt").
- Apple Developer approval lag is the single biggest risk → that's why it's Day 0.

**Web / LeagueTap.com**
- `flutter build web` → deploy to Cloudflare Pages/Vercel/Netlify → point the apex + `www` DNS at it. Flutter Web's first paint can be heavy; use the CanvasKit/HTML renderer tradeoff and a branded loading screen so it feels instant.

**Backend**
- Keep the Anthropic key **server-side only** (in the Edge Function), never in the Flutter client.
- Add a simple **rate limit + cache** on the blurb function so a beta spike can't run up API cost.

---

## 5. Key risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Apple Developer approval delay** | Med | Enroll Day 0. If delayed, web (LeagueTap.com) becomes the primary beta surface and iOS follows. |
| **It's June — NFL offseason, low news volume** | **High** | Real headline flow is thin until training camp (late July) and ramps through preseason. For the beta, supplement with **Sleeper trending players**, offseason/transaction news, and seeded sample items so the feed never looks empty. Frame beta as "core experience validation"; the product gets dramatically more useful in-season. **Worth deciding: is the goal a polished-but-quiet June beta, or timing the public push for camp?** |
| **RSS feed reliability / terms of use** | Med | Aggregate multiple feeds (redundancy), dedupe, link back to source rather than republishing full text, and keep a swap-in list. |
| **Player name-matching misses/false hits** | Med | Use Sleeper's alias data, match on full name + team + position, and add a manual override table for tricky names. |
| **Flutter Web performance/feel** | Med | Budget polish time Day 5; branded splash, lazy loading, test on real mobile browsers (not just desktop). |
| **Solo-dev scope creep** | High | Hold the "OUT of v1" line ruthlessly. The feed is the product for week one. |

---

## 6. Definition of done for the beta
A tester can: open the app (iOS or LeagueTap.com) → enter their Sleeper username → pick their league → and immediately see a **beautiful, minimalist feed of NFL news filtered to their roster**, each item ranked by impact and carrying a one-line "what this means for your team." Nothing else has to exist yet.
