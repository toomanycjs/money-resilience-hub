// pnpm rates:new 2028-29
// Copies the latest config forward with every verified date and archived
// copy cleared and every status set to "unset"-safe form, so the build fails
// until each value is checked again against its source.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '..', 'config');
const target = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(target ?? '')) {
	console.error('usage: pnpm rates:new 2028-29');
	process.exit(1);
}
const out = join(CONFIG, `${target}.json`);
if (existsSync(out)) {
	console.error(`${out} already exists`);
	process.exit(1);
}
const latest = readdirSync(CONFIG).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().at(-1);
const cfg = JSON.parse(readFileSync(join(CONFIG, latest), 'utf8'));
const [y1, y2] = target.split('-');
const fullY2 = y1.slice(0, 2) + y2;

function clear(node) {
	if (Array.isArray(node)) return node.forEach(clear);
	if (node && typeof node === 'object') {
		if ('status' in node && ('value' in node || 'rate' in node)) {
			node.verified = '';
			delete node.archived;
			if (node.status === 'in-force') node.status = 'announced';
		}
		for (const v of Object.values(node)) clear(v);
	}
}

cfg.taxYear = target;
cfg.label = `${y1}/${y2}`;
cfg.starts = `${y1}-04-06`;
cfg.ends = `${fullY2}-04-05`;
cfg.nextScheduledChange = { date: `${fullY2}-04-06`, summary: '', source: '', verified: '', status: 'announced' };
clear(cfg);
writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
console.log(`wrote ${out} from ${latest}; every verified date is cleared, so pnpm rules:check fails until each value is re-verified`);
