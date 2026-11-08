// Last-modified dates for every page, honest ones: a page's date moves when
// its source text changes or when a figure it renders changes, not when a
// value is merely re-verified. Dates come from src/data/lastmod.json, which
// `pnpm lastmod` writes from git (Vercel clones a shallow history).
//
//   pages:  the last commit that touched the page's source file
//   rules:  per tax year, the last commit that changed a config VALUE
//           (verified, archived and note fields are ignored)
// A page that renders from a tax year takes the later of the two.

import { existsSync, readFileSync } from 'node:fs';

const JSON_FILE = 'src/data/lastmod.json';

let cache;
function data() {
	if (!cache) cache = existsSync(JSON_FILE) ? JSON.parse(readFileSync(JSON_FILE, 'utf8')) : { pages: {}, rules: {}, generated: '' };
	return cache;
}

/** Date for a page path, allowing for the tax years it renders from. */
export function lastmodFor(pathname, taxYears = []) {
	const d = data();
	const dates = [d.pages[pathname], ...taxYears.map((y) => d.rules[y])].filter(Boolean);
	if (!dates.length) return d.generated || undefined;
	return dates.sort().at(-1);
}

export function rulesChangedOn(taxYear) {
	return data().rules[taxYear];
}
