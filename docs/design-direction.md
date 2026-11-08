# Design direction

The identity comes from the subject: tax is a set of thresholds, and your income sits somewhere between them. The one memorable element is the threshold ruler: a horizontal line marked with the personal allowance, the higher rate threshold, the child benefit charge, the £100,000 taper, the point where the allowance reaches zero and whichever other thresholds apply (student loan plan, NI upper earnings limit), with the person's income marked on it and the distance to the next threshold written beside the mark. It appears on every calculator and every salary page. Everything else is quiet.

The feel is a ledger kept by someone with taste: exact, unhurried, slightly stern, with the number first and the explanation always within reach. Not a bank, not a fintech, not a comparison site.

## Tokens

| Token | Value | Role |
| --- | --- | --- |
| Page | #FFFFFF | Background; this site is the one that is allowed to be white |
| Ledger | #F1F0EC, a warm stone grey | The breakdown table and the rules used box |
| Ink | #14213D, a deep blue-black that is visibly a colour | Text, rules, the take-home figure |
| Quiet | #5B6473 | Secondary text, labels |
| Deduction | #8C2F28, a dark red ink | Deduction amounts in the breakdown, and nothing else |
| Threshold | #C27C0E, a strong amber | Threshold marks on the ruler, and nothing else |
| Hairline | Quiet at 35% opacity | Rules between rows; the total gets a 2px ink rule |

Critique of the proposal, applied: the deduction red is used on the amount only, not the whole row, so a long ledger does not read as a warning; the threshold amber carries the value under each mark but not the label, so the ruler stays legible when six marks cluster; hairlines are a tint of Quiet rather than a separate grey, after the owner asked for fewer grey shades; subtitles are set in Ink for the same reason.

## Typography

Two families with distinct jobs. Newsreader (OFL, self-hosted, instanced at weight 600 and its largest optical size, then subset), a formal serif, for headings and the hero figure, so numbers feel engraved. The owner asked for a more formal face than the grotesque first proposed. Public Sans (OFL, self-hosted, subset) for everything else, with lining tabular figures (`tnum` confirmed in the font). Body at 17px, line height 1.5, measure 60 to 70 characters. Figures in tables are always tabular and right-aligned. No monospace anywhere.

Subsetting: `pnpm fonts:subset` writes Latin-1 plus the pound, en dash, minus and curly quotes, keeping `tnum`, `lnum` and `kern`.

## Layout

On a laptop the calculator is two columns: inputs on the left as a short form, the result on the right as a ledger. On a phone the result sits above the inputs and the figure stays pinned while the person scrolls the breakdown. The breakdown is a table with hairline rules between rows and a heavier rule above the total, in the ledger tone. Structure elsewhere is space and one rule weight, not boxes. Links underlined, not arrowed. Headings not numbered unless the content is a sequence.

## The result language

- The take-home figure is the largest thing on the page (monthly, since that is what people live on), with annual, weekly and daily beneath it in the body face.
- Each breakdown line reads: what it is, the rate, the slice of income it applied to, the amount, and a source chip linking to the gov.uk page. The chip is text with an underline, not a badge. Deduction amounts carry a minus sign as well as the colour.
- Thresholds are shown on the ruler and named in one sentence under it (You are £3,400 below the higher rate threshold).
- A where each pound goes bar, stacked, in ink and deduction tones only, with gaps and a legend so colour is never the only carrier. No donuts, no gauges, no speedometers.
- Nothing animates except the result updating as inputs change, which is instant (no debounce, under 200 ms INP).

## The ruler

An SVG line with amber ticks and an ink mark for the person's pay, HTML labels above and below alternating so neighbours do not collide, and a list as the text equivalent. On a phone the labels hide and the list shows. The scale is linear from zero to £150,000 or 8% above the highest mark.

## Imagery

None. No coins, piggy banks, calculators or hands holding phones. The ruler and the ledger are the picture. The share image is the page heading, the headline figure and a small ruler in the same tokens.

## Ad slots

Designed into the tile from the start, though they render nothing until ads switch on. Each slot has a fixed reserved size so nothing shifts when an ad loads, carries a quiet Advertisement label, and sits outside the calculator: never above or inside the result, the ruler or the ledger, and never beside an input or a button. On a calculator or salary page: one after How this is calculated and one between the FAQ and Related. On a phone the figure stays pinned, so there is no sticky anchor ad. Slots never borrow the ledger tone or the deduction and threshold colours.

## Defaults not to fall back to

Cream backgrounds with a serif display and a terracotta accent; dark pages with an acid green; stock-market red and green; dashboard chrome with gauges and sparklines; identical rounded cards with soft grey shadows; all-caps eyebrow labels; middle-dot meta strings; monospace for data; arrows after links; trust badges, review stars or testimonials; anything styled to resemble a payslip, P60 or bank statement.

## Process

The style tile at /design/style-tile/ (noindex, excluded from sitemaps and link checks) shows the tokens, the type scale, one full calculator result with its ruler and ledger, a salary page header, the nav and footer, and the ad slots in place. It is screenshotted at phone and laptop widths, critiqued against this document and the defaults list, revised, and approved by the owner before templates change. Screenshots live in design/screenshots/.
