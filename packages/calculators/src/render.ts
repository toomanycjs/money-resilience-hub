// HTML for the result: the figure, the ruler, the ledger, the pound bar and
// the rules used box. Pure functions of a Breakdown, so the build renders the
// default result into the page and the browser renders the same markup when
// inputs change. Every string that is not a number or a known label is escaped.

import { NATION_LABEL, STATUS_LABEL, type Breakdown, type LedgerLine, type RulerThreshold, type RulesUsed, type SimpleResult } from '@money-resilience-hub/rules';
import { escapeHtml as esc, longDate, money, pct } from './format.ts';

export interface RenderOptions {
	/** Path of the rates page for this year, e.g. /rates/2026-27/. */
	ratesPath: string;
	/** Show the ledger's arithmetic rows open by default (salary pages). */
	expanded?: boolean;
	/** Heading of the amount column; "A year" unless the tool is about a one-off amount. */
	amountHeading?: string;
}

export function renderFigure(b: Breakdown): string {
	const p = b.periods;
	return `
<p class="figure-label">Take-home pay</p>
<p class="figure"><span class="figure-amount">${money(p.monthly, 0)}</span><span class="figure-period">a month</span></p>
<dl class="figure-periods">
	<div><dt>A year</dt><dd>${money(p.annual, 0)}</dd></div>
	<div><dt>A week</dt><dd>${money(p.weekly, 0)}</dd></div>
	<div><dt>A day</dt><dd>${money(p.daily, 0)}</dd></div>
</dl>
<p class="figure-rates">Effective rate ${pct(b.effectiveRate)}${b.marginalRate != null ? `. Marginal rate on the next £1,000: ${pct(b.marginalRate)}` : ''}.</p>`;
}

/** The ruler: an SVG line with marks, HTML labels, and a list as the text equivalent. */
export function renderRuler(b: Breakdown): string {
	const income = b.payAfterSacrifice;
	const marks = b.thresholds;
	const top = Math.max(150000, Math.ceil((Math.max(income, ...marks.map((m) => m.value)) * 1.08) / 10000) * 10000);
	const x = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
	const ticks = marks.map((m) => `<line class="ruler-tick" x1="${x(m.value).toFixed(2)}" x2="${x(m.value).toFixed(2)}" y1="14" y2="34" />`).join('');
	const labels = marks
		.map((m, i) => {
			const side = i % 2 === 0 ? 'above' : 'below';
			const pos = x(m.value);
			const edge = pos < 9 ? ' edge-left' : pos > 91 ? ' edge-right' : '';
			return `<li class="ruler-label ${side}${edge}" style="left:${pos.toFixed(2)}%"><span class="ruler-name">${esc(m.label)}</span><span class="ruler-value">${money(m.value, 0)}</span></li>`;
		})
		.join('');
	const youPos = x(income);
	const you = youPos.toFixed(2);
	const youEdge = youPos < 9 ? ' edge-left' : youPos > 91 ? ' edge-right' : '';
	return `
<div class="ruler" aria-hidden="true">
	<ol class="ruler-labels">${labels}</ol>
	<svg class="ruler-line" viewBox="0 0 100 48" preserveAspectRatio="none" focusable="false">
		<line class="ruler-axis" x1="0" x2="100" y1="24" y2="24" />
		${ticks}
		<line class="ruler-you-tick" x1="${you}" x2="${you}" y1="2" y2="46" />
	</svg>
	<p class="ruler-you${youEdge}" style="left:${you}%"><span class="ruler-you-text">Your pay ${money(income, 0)}</span></p>
</div>
<p class="ruler-sentence">${b.nextThreshold ? esc(b.nextThreshold.sentence) : 'You are above every threshold on this ruler.'}</p>
<ul class="ruler-list">${marks.map((m) => `<li>${esc(m.label)}: ${money(m.value, 0)}${m.value > income ? ` (${money(m.value - income, 0)} above your pay)` : ' (below your pay)'}</li>`).join('')}</ul>`;
}

function lineRow(l: LedgerLine, i: number, expanded: boolean): string {
	const sign = l.sign === -1 && l.amount !== 0 ? '−' : '';
	const cls = l.sign === -1 ? 'deduction' : l.kind === 'total' ? 'total' : l.kind === 'allowance' || l.kind === 'info' ? 'info' : 'income';
	const rate = l.rate != null ? pct(l.rate) : '';
	const slice = l.slice != null ? money(l.slice) : '';
	const amount = l.kind === 'allowance' && l.sign === 0 ? money(l.amount) : `${sign}${money(l.amount)}`;
	const src = l.provenance?.source ? `<a class="source-chip" href="${esc(l.provenance.source)}" rel="noopener">gov.uk</a>` : '';
	const id = `arith-${i}`;
	return `
<tr class="ledger-row ${cls}">
	<th scope="row"><button type="button" class="ledger-toggle" aria-expanded="${expanded}" aria-controls="${id}">${esc(l.label)}</button></th>
	<td class="num">${rate}</td>
	<td class="num">${slice}</td>
	<td class="num amount">${amount}</td>
	<td class="src">${src}</td>
</tr>
<tr class="ledger-arith" id="${id}"${expanded ? '' : ' hidden'}><td colspan="5">${esc(l.arithmetic)}${l.provenance ? ` <span class="arith-meta">Checked ${longDate(l.provenance.verified)}, ${STATUS_LABEL[l.provenance.status].toLowerCase()}.</span>` : ''}</td></tr>`;
}

/** What the ledger needs: the lines, the notes under them and a caption. */
export type LedgerSource = Pick<Breakdown, 'lines' | 'warnings' | 'label'> & Partial<Pick<Breakdown, 'gross' | 'takeHome'>> & { caption?: string };

export function renderLedger(b: LedgerSource, opts: RenderOptions): string {
	const expanded = !!opts.expanded;
	const rows = b.lines.map((l, i) => lineRow(l, i, expanded)).join('');
	const caption = b.caption ?? `How ${money(b.gross ?? 0, 0)} becomes ${money(b.takeHome ?? 0, 0)} in ${b.label}`;
	return `
<table class="ledger">
	<caption class="visually-hidden">${esc(caption)}</caption>
	<thead><tr><th scope="col">Line</th><th scope="col" class="num">Rate</th><th scope="col" class="num">On</th><th scope="col" class="num">${esc(opts.amountHeading ?? 'A year')}</th><th scope="col" class="src">Source</th></tr></thead>
	<tbody>${rows}</tbody>
</table>
${b.warnings.length ? `<ul class="ledger-notes">${b.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

/** Where each pound goes: a stacked bar in ink and deduction tones only. */
export function renderBar(b: Breakdown): string {
	const parts: { label: string; amount: number; cls: string }[] = [{ label: 'Take-home', amount: b.takeHome, cls: 'keep' }];
	if (b.incomeTax.total > 0) parts.push({ label: 'Income tax', amount: b.incomeTax.total, cls: 'ded' });
	if (b.nationalInsurance.total > 0) parts.push({ label: 'National Insurance', amount: b.nationalInsurance.total, cls: 'ded' });
	if (b.studentLoans.total > 0) parts.push({ label: 'Student loan', amount: b.studentLoans.total, cls: 'ded' });
	if (b.pension) parts.push({ label: 'Pension', amount: b.pension.type === 'salary-sacrifice' ? b.pension.gross : b.pension.fromPay, cls: 'ded' });
	const total = parts.reduce((s, p) => s + p.amount, 0) || 1;
	let xPos = 0;
	const rects = parts
		.map((p) => {
			const w = (p.amount / total) * 100;
			const r = `<rect class="bar-${p.cls}" x="${xPos.toFixed(2)}" y="0" width="${Math.max(0, w - 0.3).toFixed(2)}" height="100" />`;
			xPos += w;
			return r;
		})
		.join('');
	const legend = parts.map((p) => `<li><span class="swatch swatch-${p.cls}" aria-hidden="true"></span>${esc(p.label)} ${money(p.amount, 0)} (${pct(p.amount / total)})</li>`).join('');
	return `
<svg class="bar" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${pct(p.amount / total)}`).join(', '))}">${rects}</svg>
<ul class="bar-legend">${legend}</ul>`;
}

export function renderRulesUsed(b: { rulesUsed: RulesUsed }, opts: RenderOptions): string {
	const r = b.rulesUsed;
	const checked = r.verifiedFrom === r.verifiedTo ? `Checked on ${longDate(r.verifiedTo)}` : `Checked between ${longDate(r.verifiedFrom)} and ${longDate(r.verifiedTo)}`;
	return `
<dl class="rules-used-list">
	<div><dt>Tax year</dt><dd>${esc(r.label)} (6 April ${r.taxYear.slice(0, 4)} to 5 April ${r.taxYear.slice(0, 2)}${r.taxYear.slice(5)})</dd></div>
	<div><dt>Nation</dt><dd>${NATION_LABEL[r.nation]}</dd></div>
	<div><dt>Figures</dt><dd>${checked}. Status: ${STATUS_LABEL[r.status].toLowerCase()}.</dd></div>
	<div><dt>Next scheduled change</dt><dd>${longDate(r.nextChange.date)}: ${esc(r.nextChange.summary)}</dd></div>
	<div><dt>Every figure</dt><dd><a href="${esc(opts.ratesPath)}">Rates and allowances for ${esc(r.label)}</a>, each with its source and the date it was checked.</dd></div>
</dl>`;
}

/** Plain text of the result, for the copy action. */
export function toText(b: Breakdown, siteUrl: string, path: string): string {
	const lines = [`Take-home pay on ${money(b.gross, 0)} in ${b.label} (${NATION_LABEL[b.nation]})`, ''];
	for (const l of b.lines) {
		const amount = `${l.sign === -1 ? '-' : ''}${money(l.amount)}`;
		lines.push(`${l.label}${l.rate != null ? ` at ${pct(l.rate)}` : ''}${l.slice != null ? ` on ${money(l.slice)}` : ''}: ${amount}`);
	}
	lines.push('', `A month ${money(b.periods.monthly)}, a week ${money(b.periods.weekly)}, a day ${money(b.periods.daily)}.`);
	if (b.nextThreshold) lines.push(b.nextThreshold.sentence);
	lines.push('', `Rules: ${b.label}, checked ${longDate(b.rulesUsed.verifiedTo)}. Sources: ${b.rulesUsed.sources.map((s) => s.source).join(', ')}`);
	lines.push(`${siteUrl}${path}`);
	return lines.join('\n');
}

export type { RulerThreshold };

/** The headline of a single-purpose tool: the amount, its unit, the secondary figures and one sentence. */
export function renderSimpleFigure(r: SimpleResult): string {
	const figures = r.figures.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${f.rate ? pct(f.amount) : money(f.amount, 0)}</dd></div>`).join('');
	return `
<p class="figure-label">${esc(r.headline.label)}</p>
<p class="figure"><span class="figure-amount">${money(r.headline.amount, 0)}</span><span class="figure-period">${esc(r.headline.unit)}</span></p>
<dl class="figure-periods">${figures}</dl>
<p class="figure-rates">${esc(r.note)}</p>`;
}

/** Plain text of a simple result, for the copy action. */
export function simpleToText(r: SimpleResult, siteUrl: string, path: string): string {
	const lines = [`${r.headline.label}: ${money(r.headline.amount)} ${r.headline.unit} in ${r.label}`, r.note, ''];
	for (const l of r.lines) {
		const amount = `${l.sign === -1 ? '-' : ''}${money(l.amount)}`;
		lines.push(`${l.label}${l.rate != null ? ` at ${pct(l.rate)}` : ''}${l.slice != null ? ` on ${money(l.slice)}` : ''}: ${amount}`);
	}
	if (r.comparison) lines.push('', r.comparison.sentence);
	lines.push('', `Rules: ${r.label}, checked ${longDate(r.rulesUsed.verifiedTo)}. Sources: ${r.rulesUsed.sources.map((s) => s.source).join(', ')}`);
	lines.push(`${siteUrl}${path}`);
	return lines.join('\n');
}

/** A readable name for a source: the last part of a gov.uk address, or the host and path elsewhere. */
function sourceName(url: string): string {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, '');
		const last = u.pathname.split('/').filter(Boolean).pop();
		if (host !== 'gov.uk' || !last) return host + u.pathname.replace(/\/$/, '');
		const words = last.replace(/-/g, ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	} catch {
		return url;
	}
}

/**
 * The rules used box for a single-purpose tool: the same list as the
 * take-home calculator's, with a row naming the sources this result drew
 * on, so choosing another nation shows that nation's sources.
 */
export function renderSimpleRulesUsed(b: { rulesUsed: RulesUsed }, opts: RenderOptions): string {
	const items = b.rulesUsed.sources
		.map((s) => `<li><a href="${esc(s.source)}" rel="noopener">${esc(sourceName(s.source))}</a>, checked ${longDate(s.verified)}${s.status !== 'in-force' ? `, ${STATUS_LABEL[s.status].toLowerCase()}` : ''}</li>`)
		.join('');
	const row = items ? `\t<div><dt>Sources used</dt><dd><ul class="sources-used">${items}</ul></dd></div>\n` : '';
	return renderRulesUsed(b, opts).replace('</dl>', `${row}</dl>`);
}
