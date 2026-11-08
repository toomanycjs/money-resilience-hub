// pnpm sources:archive
// Fetches every source URL cited in the configs and keeps a copy under
// packages/rules/archive/<date>/, then records the path on each leaf that
// has none. It never changes a value. The check script requires the copy.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'config');
const today = new Date().toISOString().slice(0, 10);
const UA = 'Mozilla/5.0 (compatible; MoneyResilienceHub source archive; +https://github.com/)';

export function slugFor(url) {
	const u = new URL(url);
	const path = (u.hostname + u.pathname).replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
	const ext = u.pathname.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html';
	return `${path.slice(0, 150)}.${ext}`;
}

async function fetchTo(url, file) {
	const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8' }, signal: AbortSignal.timeout(30000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function leaves(node, out = []) {
	if (Array.isArray(node)) node.forEach((x) => leaves(x, out));
	else if (node && typeof node === 'object') {
		if ('status' in node && ('value' in node || 'rate' in node) && node.source) out.push(node);
		for (const [k, v] of Object.entries(node)) if (k !== 'previous' || true) leaves(v, out);
	}
	return out;
}

const files = readdirSync(CONFIG).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
const dir = join(ROOT, 'archive', today);
mkdirSync(dir, { recursive: true });
const fetched = new Map();
let failures = 0;

for (const file of files) {
	const cfg = JSON.parse(readFileSync(join(CONFIG, file), 'utf8'));
	const all = leaves(cfg);
	if (cfg.nextScheduledChange?.source) all.push(cfg.nextScheduledChange);
	let changed = false;
	for (const leaf of all) {
		if (leaf.archived && existsSync(join(ROOT, leaf.archived))) continue;
		const url = leaf.source;
		if (!fetched.has(url)) {
			const rel = `archive/${today}/${slugFor(url)}`;
			const abs = join(ROOT, rel);
			if (!existsSync(abs)) {
				try {
					await fetchTo(url, abs);
					console.log(`archived ${url}`);
				} catch (e) {
					console.error(`could not fetch ${url}: ${e.message}`);
					failures++;
					fetched.set(url, null);
					continue;
				}
			}
			fetched.set(url, rel);
		}
		const rel = fetched.get(url);
		if (rel) {
			leaf.archived = rel;
			changed = true;
		}
	}
	if (changed) writeFileSync(join(CONFIG, file), JSON.stringify(cfg, null, 2) + '\n');
}
console.log(`${fetched.size} source URL(s), ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
