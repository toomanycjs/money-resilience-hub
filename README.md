# The Money Resilience Hub

UK personal finance calculators that show their working. Every result lists each deduction with the rate it used, the slice of income it applied to and the gov.uk page the figure came from, dated. Facts, not advice.

## Layout

- `packages/rules`: one config file per tax year, each value with its source, verified date, status and an archived copy of the source page; pure functions (income tax, National Insurance, student loans, take-home, thresholds, year-on-year changes, the Pension Tax Allowance); fixtures from HMRC worked examples and blind edge cases; `ROUNDING.md`.
- `packages/calculators`: the input schema, formatting, share links, saved inputs, and the HTML renderers for the figure, ruler, ledger, bar and rules used box. The build and the browser render the same markup.
- `src`: the Astro site. Pages hold no arithmetic and no typed figures.
- `config/waves.json`: which generated pages are live.
- `docs/design-direction.md`: the design direction. `/design/style-tile/` is the style tile.
- `.claude/commands`: the custom commands (`/verify-rates`, `/add-calculator`, `/wave`, `/fiscal-event`, `/design-review`, `/review-pack`, `/press-pack`, `/source-watch`, `/correction`, `/search-review`, `/data-story`, `/ads-check`).

## Commands

```bash
corepack pnpm install
corepack pnpm test        # rules check + fixtures
corepack pnpm dev
corepack pnpm build       # rules check, astro build, site checks
corepack pnpm check       # site checks on dist/
corepack pnpm lighthouse  # needs Chrome
corepack pnpm rates:new 2028-29
corepack pnpm pages:gen
corepack pnpm sources:archive
corepack pnpm sources:watch
corpack pnpm lastmod
```

## Licences

Code: MIT. Rules data (`packages/rules/config`, served at `/rules/<year>.json`): CC BY 4.0, attribution "The Money Resilience Hub". Source figures are Crown copyright under the Open Government Licence v3.0. Fonts: Newsreader and Public Sans under the SIL Open Font Licence (see `public/fonts`).
