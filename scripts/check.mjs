// pnpm check
// Build checks over the source and the built site. Fails on:
//   - a £ figure or a thousands-separated number typed into a page, layout or component
//   - a rules used box missing on a page with a calculator
//   - a calculator page without both dates (rules as at, next scheduled change)
//   - advice wording (should, best, recommend) in rendered text
//   - a third-party script or stylesheet outside the allowlist
//   - an ad slot without a reserved size or label, or inside the calculator core
//   - a title over 60 characters, a missing description or canonical, a wrong lang
//   - nosnippet or max-snippet on a public page
//   - American spellings in rendered text
//   - near-identical neighbouring salary pages
//   - analytics code importing the engine or calculators

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const errors = [];
const warn = [];

function walk(dir, ext) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = join(dir, d.name);
		return d.isDirectory() ? walk(p, ext) : ext.some((e) => d.name.endsWith(e)) ? [p] : [];
	});
}

// ---- Source checks ----

/** Remove frontmatter and {expressions} so only literal template text remains. */
function literalText(src) {
	let s = src.replace(/^---[\s\S]*?\n---/, '');
	s = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
	let out = '';
	let depth = 0;
	for (const ch of s) {
		if (ch === '{') depth++;
		else if (ch === '}') depth = Math.max(0, depth - 1);
		else if (depth === 0) out += ch;
	}
	return out;
}

for (const file of [...walk('src/pages', ['.astro']), ...walk('src/layouts', ['.astro']), ...walk('src/components', ['.astro']), ...walk('src/content', ['.md', '.mdx'])]) {
	const text = literalText(readFileSync(file, 'utf8'));
	for (const m of text.matchAll(/£\s?\d[\d,.]*/g)) errors.push(`${file}: typed figure "${m[0]}"; compute it from the rules or a data file`);
	for (const m of text.matchAll(/\b\d{1,3}(?:,\d{3})+\b/g)) errors.push(`${file}: typed number "${m[0]}"; compute it from the rules or a data file`);
}

const analytics = readFileSync('src/scripts/analytics.ts', 'utf8');
if (/@money-resilience-hub|calculator\b/.test(analytics.replace(/\/\/.*$/gm, '').replace(/\[data-calculator\]/g, ''))) errors.push('src/scripts/analytics.ts must not import the engine or the calculators');

// ---- Built site checks ----

if (!existsSync(DIST)) {
	errors.push('dist/ not found: run astro build first');
} else {
	const files = walk(DIST, ['.html']);
	const ALLOW = ['www.googletagmanager.com', ...(process.env.SCRIPT_ALLOWLIST ?? '').split(',').filter(Boolean)];
	const salaryTexts = [];
	for (const file of files) {
		const page = '/' + file.slice(DIST.length).replace(/\\/g, '/').replace(/^\/|index\.html$/g, '');
		if (page === '/404.html') continue;
		const html = readFileSync(file, 'utf8');
		const isDesign = page.startsWith('/design/');
		const text = html
			.replace(/<script[\s\S]*?<\/script>/g, ' ')
			.replace(/<style[\s\S]*?<\/style>/g, ' ')
			.replace(/<head[\s\S]*?<\/head>/g, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/\s+/g, ' ');

		const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
		if (!title) errors.push(`${page}: no title`);
		else if (title.length > 60 && !isDesign) errors.push(`${page}: title is ${title.length} characters ("${title}")`);
		if (!/<meta name="description" content="[^"]+"/.test(html)) errors.push(`${page}: no description`);
		if (!/<link rel="canonical"/.test(html)) errors.push(`${page}: no canonical`);
		if (!/<html lang="en-GB">/.test(html)) errors.push(`${page}: lang is not en-GB`);
		if (/nosnippet|max-snippet/.test(html) && !isDesign) errors.push(`${page}: snippet limits are not allowed`);

		for (const m of html.matchAll(/<script[^>]+src="(https?:)?\/\/([^/"]+)/g)) if (!ALLOW.includes(m[2])) errors.push(`${page}: third-party script from ${m[2]} is not in the allowlist`);
		for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(https?:)?\/\/([^/"]+)/g)) if (!ALLOW.includes(m[2])) errors.push(`${page}: third-party stylesheet from ${m[2]} is not in the allowlist`);

		if (/data-calculator\b/.test(html)) {
			if (!/data-rules-used/.test(html)) errors.push(`${page}: has a calculator but no rules used box`);
			if (!/Next scheduled change/.test(text) || !/Checked (on|between)/.test(text)) errors.push(`${page}: rules used box must show the checked date and the next scheduled change`);
		}

		if (!isDesign) {
			for (const m of text.matchAll(/\b(should|best|recommend\w*)\b/gi)) errors.push(`${page}: advice wording "${m[0]}" (${text.slice(Math.max(0, m.index - 40), m.index + 40).trim()})`);
		}
		for (const m of text.matchAll(/\b(color|colors|organize[ds]?|center|centered|favorite|analyze|behavior|catalog|gotten)\b/g)) errors.push(`${page}: American spelling "${m[0]}"`);

		const coreStart = html.indexOf('data-calculator-core');
		const coreEnd = coreStart >= 0 ? html.indexOf('</section>', Math.max(html.lastIndexOf('data-bar'), html.lastIndexOf('data-ledger'))) : -1;
		for (const m of html.matchAll(/<aside class="ad-slot"[^>]*>/g)) {
			const tag = m[0];
			if (!/data-width="\d+"/.test(tag) || !/data-height="\d+"/.test(tag)) errors.push(`${page}: ad slot without a reserved size`);
			const after = html.slice(m.index, m.index + 400);
			if (!/Advertisement/.test(after)) errors.push(`${page}: ad slot without its label`);
			if (coreStart >= 0 && m.index > coreStart && m.index < coreEnd) errors.push(`${page}: ad slot inside the result, ruler, ledger or bar`);
		}
		if (/\.(ledger|rules-used|ruler)\b[^{]*\{[^}]*ad/.test(html)) errors.push(`${page}: ad styling borrows a content tone`);

		if (/^\/salary\/\d+\/$/.test(page)) {
			const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? '';
			const stripped = main.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/[\d,.]+/g, '#').replace(/\s+/g, ' ');
			salaryTexts.push({ page, amount: Number(page.match(/\d+/)[0]), stripped, html });
		}
	}
	salaryTexts.sort((a, b) => a.amount - b.amount);
	for (let i = 1; i < salaryTexts.length; i++) {
		const a = salaryTexts[i - 1];
		const b = salaryTexts[i];
		if (a.stripped === b.stripped) {
			// Identical text apart from digits: the facts must still differ by more than the margins (see guardReport).
			const take = (h) => Number(h.match(/data-result="[^"]*?takeHome&quot;:([\d.]+)/)?.[1] ?? h.match(/class="figure-amount">£([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0);
			if (Math.abs(take(a.html) - take(b.html)) < 75) errors.push(`${b.page} is near-identical to ${a.page}`);
			else warn.push(`${b.page} has the same wording as ${a.page}; the figures differ`);
		}
	}
	console.log(`checked ${files.length} built pages`);
}

for (const w of warn) console.warn(`warning: ${w}`);
if (errors.length) {
	for (const e of errors) console.error(`error: ${e}`);
	console.error(`check failed with ${errors.length} error(s)`);
	process.exit(1);
}
console.log(`check passed (${warn.length} warning(s))`);
