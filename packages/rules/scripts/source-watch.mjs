// pnpm sources:watch
// Fetches every source URL again, compares its text with the archived copy
// and lists the rules that cite a page that changed. It never changes a value.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'config');
const UA = 'Mozilla/5.0 (compatible; MoneyResilienceHub source watch)';

function text(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function mainContent(html) {
	const m = html.match(/<main[\s\S]*?<\/main>/i);
	return text(m ? m[0] : html);
}

function cites(node, path, url, out) {
	if (Array.isArray(node)) node.forEach((x, i) => cites(x, `${path}[${i}]`, url, out));
	else if (node && typeof node === 'object') {
		if (node.source === url && 'status' in node) out.push(path);
		for (const [k, v] of Object.entries(node)) cites(v, path ? `${path}.${k}` : k, url, out);
	}
}

const files = readdirSync(CONFIG).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
const byUrl = new Map();
for (const file of files) {
	const cfg = JSON.parse(readFileSync(join(CONFIG, file), 'utf8'));
	const collect = (node) => {
		if (Array.isArray(node)) node.forEach(collect);
		else if (node && typeof node === 'object') {
			if (node.source && node.archived) byUrl.set(node.source, node.archived);
			for (const v of Object.values(node)) collect(v);
		}
	};
	collect(cfg);
}

let changed = 0;
for (const [url, archived] of byUrl) {
	const file = join(ROOT, archived);
	if (!existsSync(file) || archived.endsWith('.pdf')) continue;
	try {
		const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
		const live = mainContent(await res.text());
		const kept = mainContent(readFileSync(file, 'utf8'));
		if (live !== kept) {
			changed++;
			const rules = [];
			for (const f of files) cites(JSON.parse(readFileSync(join(CONFIG, f), 'utf8')), f.replace('.json', ''), url, rules);
			console.log(`CHANGED ${url}\n  archived ${archived}\n  re-verify: ${rules.join(', ')}`);
		}
	} catch (e) {
		console.log(`could not fetch ${url}: ${e.message}`);
	}
}
console.log(changed ? `${changed} source page(s) changed since they were archived` : 'no source page has changed since it was archived');
