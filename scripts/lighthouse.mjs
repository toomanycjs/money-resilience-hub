// pnpm lighthouse
// Runs Lighthouse on the home page, the take-home calculator and a salary
// page against a local preview, with the throttled mobile profile, and
// fails if performance, accessibility or best practices are under 95.
// Needs Chrome on the machine; Lighthouse is fetched with npx.

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PORT = 4323;
const PAGES = ['/', '/calculators/take-home-pay/', '/salary/30000/'];
const MIN = 95;

const preview = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { shell: true, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 4000));
mkdirSync('.lighthouse', { recursive: true });
let failed = false;
try {
	for (const page of PAGES) {
		const out = `.lighthouse/${page.replace(/\W+/g, '_') || 'home'}.json`;
		// Lighthouse's default profile is the throttled mobile one.
		execFileSync('npx', ['--yes', 'lighthouse@12', `http://localhost:${PORT}${page}`, '--output=json', `--output-path=${out}`, '--chrome-flags=--headless=new', '--quiet', '--only-categories=performance,accessibility,best-practices,seo'], { shell: true, stdio: 'inherit' });
		const r = JSON.parse(readFileSync(out, 'utf8'));
		const scores = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
		const inp = r.audits['interaction-to-next-paint']?.numericValue;
		console.log(page, scores, inp ? `INP ${Math.round(inp)}ms` : '');
		for (const k of ['performance', 'accessibility', 'best-practices']) if (scores[k] < MIN) failed = true;
	}
} finally {
	preview.kill();
}
if (failed) {
	console.error(`one or more scores under ${MIN}`);
	process.exit(1);
}
