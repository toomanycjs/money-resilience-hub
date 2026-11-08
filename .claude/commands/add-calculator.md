Scaffold a new calculator with the id $ARGUMENTS.

1. Add the engine function in packages/rules/src/<id>.ts, reading only from the year config via resolve(); if a value it needs is missing from the config, add it with value null, status "unset" and a note, and say so. Export it from index.ts. Write packages/rules/fixtures/<id>.json with at least three cases from gov.uk pages, each with source URLs.
2. Add the input schema and any renderer the tool needs in packages/calculators (reuse the ledger, ruler and rules used renderers where they fit).
3. Create src/pages/calculators/<id>.astro from the Calculator layout: H1 for the search, subtitle naming the tax year and nations, the "how" slot, limits line, FAQ in people-also-ask phrasing, three hand-picked related links.
4. Add the tool to src/pages/calculators/index.astro and link it from at least one other page.
5. Run `pnpm test` and `pnpm build`, then stop for review. Do not write guides.
