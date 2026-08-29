// blurb_lab.ts — CLI harness for tuning the reporter personas in the console.
// Shares all logic with the web UI via blurb_core.ts.
//
// RUN:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   deno run --allow-net --allow-read --allow-env tools/blurb_lab.ts
//   # one persona:  ... tools/blurb_lab.ts breaking
//   # one fixture:  ... tools/blurb_lab.ts --only 2
//   # offseason:    ... tools/blurb_lab.ts --offseason
//
// Fixtures come from tools/fixtures.json — build them from your real RSS feeds:
//   deno run --allow-net --allow-read --allow-write tools/build_fixtures.ts
//
// To tune: edit DEFAULT_PERSONAS / buildPrompt / BLURB_TOOL in blurb_core.ts,
// re-run. Prefer a visual loop? deno run --allow-net --allow-read --allow-env tools/blurb_server.ts

import {
  ANTHROPIC_MODEL, DEFAULT_PERSONAS, describePlayer, generateBlurb, loadFixtures,
} from "./blurb_core.ts";

function fmt(input: any): string {
  const meta = [input.action, input.severity, input.confidence, input.timeframe,
    input.relevance != null ? `rel ${input.relevance}` : null,
    Array.isArray(input.tags) && input.tags.length ? input.tags.join("/") : null]
    .filter(Boolean).join(" · ");
  return (input.subject ? `[${input.subject}]\n                ` : "") +
    `${input.blurb ?? "(no blurb)"}\n        ↳ ${meta}` +
    (input.reasoning ? `\n        ↳ why: ${input.reasoning}` : "");
}

async function main() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); Deno.exit(1); }

  const args = Deno.args;
  const offseason = args.includes("--offseason");
  const onlyIdx = args.includes("--only") ? Number(args[args.indexOf("--only") + 1]) : null;
  const onlyPersona = args.find((a) => DEFAULT_PERSONAS[a]) ?? null;

  const all = await loadFixtures();
  const personas = onlyPersona ? [DEFAULT_PERSONAS[onlyPersona]] : Object.values(DEFAULT_PERSONAS);
  const fixtures = onlyIdx != null ? [all[onlyIdx]] : all;

  console.log(`\nBLURB LAB — ${ANTHROPIC_MODEL}${offseason ? " · OFFSEASON" : ""}\n`);
  for (const fx of fixtures) {
    console.log(`━━━ [${fx.label}] ${fx.headline}  (${fx.source ?? "?"} · body ${fx.body.length}c)`);
    console.log(`    roster: ${fx.players.map(describePlayer).join("; ")}\n`);
    for (const p of personas) {
      try {
        const input = await generateBlurb(apiKey, fx, p, offseason);
        console.log(`  ${p.name.padEnd(13)} (t${p.temperature}) ▸ ${fmt(input)}\n`);
      } catch (e) {
        console.log(`  ${p.name.padEnd(13)} ▸ ERROR ${(e as Error).message}\n`);
      }
    }
  }
}

main();
