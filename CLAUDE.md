# Project: UK money calculators site (The Money Resilience Hub)

## What this is
A static Astro site of UK personal finance calculators that show their working. Every figure comes
from a primary source recorded in packages/rules. Inputs stay in the browser. No sign-up. Funded by display ads once traffic qualifies.
Author and publisher of every page: The Money Resilience Hub.

## Absolute rules
- No number is typed into a page, guide or component. Every figure is computed from packages/rules
  or rendered from a data file that carries source and retrieved dates.
- Every rules value carries source (URL), verified (date), status (announced | legislated | in-force | unset)
  and archived (the path of a copy of the source page taken on the verified date). The build fails without them.
  Pages show status wherever a figure appears.
- Never remember a rate or threshold. If a source cannot be found, leave the value null with status "unset"
  and a note saying why, and the tool says so.
- Facts, not advice. A page can state a marginal rate or a threshold. It never recommends an action.
  pnpm check fails on "should", "best" and "recommend" in rendered text.
- Nothing may resemble a real payslip, P60, HMRC letter or bank statement. The ledger is our own.
- No tool models a rule under legal challenge or needing live market data.
- Calculator inputs never reach analytics, ad requests, logs or any URL sent to a third party. Inputs live in
  the URL hash, never the query string, and the hash is stripped before anything is counted.
- Analytics is Google Analytics 4 (the owner's decision, 9 November 2026), loaded after the page (src/scripts/analytics.ts, ID in
  src/config/analytics.ts). The share hash is removed from the address before it loads and the page address sent is origin and path only.
  It loads only after the visitor presses Accept on the cookie banner (src/components/CookieBanner.astro); before a choice and after
  Reject all, nothing is sent. The footer's Cookie choices link reopens the banner. The same choice will govern advertising cookies.
  Advertising cookies only after consent through a Google-certified consent platform.
- Ads only in the reserved, labelled slots (AdSlot component); never within items 1 to 6 of the calculator template.
- No affiliate or paid links inside any calculator result, ledger or rules used box.
- No reviews, ratings or testimonials. No FAQPage markup unless the questions are visible on the page.

## House style
- British English, sentence case, no em dashes, no all-caps labels, no arrows after links, no middle-dot meta strings.
- Copy is short and plain. Active voice. Buttons say what happens (Show the arithmetic, Save as PDF).
- Money is formatted with £, thousands separators and two decimals in ledgers, none in headlines. Use money() and pct()
  from packages/calculators; never format by hand.

## Design
- Follow docs/design-direction.md. The style tile at /design/style-tile/ is the source of truth once approved.
- The threshold ruler and the ledger are the identity. Two typefaces (Newsreader for display, Public Sans for text), tabular figures, no monospace. One grey (Quiet); hairlines are a tint of it.
- Avoid the generic defaults listed in docs/design-direction.md. Screenshot and critique before shipping.

## Engineering
- packages/rules: config per tax year (2025-26, 2026-27, 2027-28) with effectiveFrom and previous for mid-year changes;
  pure functions; fixtures from HMRC worked examples and blind edge cases in packages/rules/fixtures with source URLs.
  pnpm test must pass before any page work. Relative imports inside packages carry the .ts extension so plain Node can load them.
- packages/calculators: input schema, formatting, share link, saved inputs, and the HTML renderers for the figure,
  ruler, ledger, bar and rules used box. The build and the browser render the same markup. No arithmetic in the site.
- The default result of every calculator is rendered into the static HTML, then hydrated by src/scripts/calculator.ts.
- Generated pages (salary, hourly, monthly) come from config/waves.json. Never generate beyond the current wave.
  A generated page carries at least four computed facts beyond the headline and at least two that differ from both
  neighbours (categorical facts, or figures moving by more than the margins in src/lib/salaryPage.ts). The build skips it otherwise.
- One sitemap per family (src/integrations/sitemaps.mjs). lastmod changes only when a figure or the text changes (scripts/lastmod.mjs).
- robots.txt allows search crawlers, including OAI-SearchBot and PerplexityBot. No nosnippet or max-snippet.
- Every guide names its author and reviewer and shows a reviewed-on date.
- Build checks (scripts/check.mjs and the integrations): missing source, verified, status or archive; stale verified (>180 days);
  orphan pages (fewer than two inbound links outside the header); missing rules used box; typed numbers in pages; advice wording;
  third-party scripts outside the allowlist; ad slots without a reserved size or label; near-identical neighbouring pages;
  analytics code touching the engine.
- Lighthouse 95+ on mobile for home, the take-home calculator and a salary page (pnpm lighthouse).

## Commands
- pnpm dev, pnpm build (runs rules:check, astro build, check), pnpm test, pnpm check, pnpm lighthouse,
  pnpm rates:new <year>, pnpm pages:gen, pnpm sources:archive, pnpm sources:watch, pnpm lastmod, pnpm fonts:subset
- Use `corepack pnpm` if pnpm is not on the path.
