# SVG Competency Roadmap — LeagueTap

Goal: become competent at creating and editing scalable vector graphics for LeagueTap's emotional design (reporter characters, visual content), and build an AI-assisted "generate → review → approve/refine" pipeline. Budget: ≤ $25/mo, ideally spent on AI generation.

## Three sources of SVG (you'll use all three)

1. **AI text-to-vector (Recraft)** — reporter characters and rich illustrations. The generate/review/approve workflow.
2. **LLMs outputting SVG code directly** — icons, badges, emotional-state glyphs, UI marks. A capable model writes raw SVG you paste straight into Flutter. Already the integrated workflow; no extra cost.
3. **You, hand-editing (Inkscape)** — fix, refine, and enforce style consistency on whatever the AI produces. The skill to build.

## Recommended stack (~$10/mo)

- **Recraft — Basic $10/mo.** True vector SVG output (clean paths, not traced bitmaps). Has a style/brand system so all reporter characters share one visual world — this consistency is the whole point. Commercial rights + private generation on Basic. Advanced ($27/mo) only once generating heavily.
- **Inkscape — free.** Learn vector fundamentals here; edits any SVG. Don't pay the Adobe tax while learning.
- **SVGO — free.** Optimize/shrink SVGs before they hit Flutter.
- **Skip Illustrator for now** ($22.99/mo eats the whole budget; Firefly text-to-vector is weaker than Recraft here). Revisit only if Inkscape becomes limiting.

Net spend: **$10/mo**, with headroom to upgrade Recraft later.

## Competency plan (~6–8 weeks, a few hours/week)

**Phase 1 — Read SVG (week 1).** Learn `path`, `d`, `viewBox`, `fill`, `stroke`, `<g>` groups. Goal: read an SVG and know what each part does, so you can review AI output critically. Resource: MDN SVG tutorial.

**Phase 2 — Edit in Inkscape (weeks 2–3).** Node editor, pen tool, boolean operations, align/distribute. Exercise: change an AI reporter's expression by moving nodes.

**Phase 3 — Establish your style system (weeks 3–4).** Define palette, line weight, corner radius, proportions. Build one reporter character to completion as the reference you feed Recraft and the LLM.

**Phase 4 — The AI loop (weeks 4–6).** Prompt Recraft with your style reference, then Inkscape-refine every output. In parallel, have the LLM generate icon/emotional-state variants directly; review and iterate. This is the production pipeline.

**Phase 5 — Optimize & integrate (weeks 6–8).** Run outputs through SVGO to shrink file size; confirm rendering in `flutter_svg`.

## Sources

- Recraft AI Vector Generator — https://www.recraft.ai/ai-vector-generator
- Recraft pricing — https://checkthat.ai/brands/recraft/pricing
- Best AI SVG generators 2026 (VectoSolve) — https://vectosolve.com/blog/best-ai-svg-generators-text-to-vector-2026
- Adobe Illustrator plans — https://www.adobe.com/products/illustrator/plans.html
