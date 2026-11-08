// pnpm lastmod
// Writes src/data/lastmod.json: the last commit that touched each page's
// source, and for each tax year the last commit that changed a config value
// (ignoring verified, archived and note fields). Commit the result with page
// changes; the build reads this file rather than asking git.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PAGES = 'src/pages';
const CONFIG = 'packages/rules/config';
const today = new Date().toISOString().slice(0, 10);

const git = (...args) => {
	try {
		return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
};

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}
const posix = (p) => p.split(sep).join('/');

const pages = {};
for (const file of walk(PAGES).filter((f) => f.endsWith('.astro'))) {
	const rel = posix(relative(PAGES, file)).replace(/\.astro$/, '');
	if (rel.includes('[') || rel === '404' || rel.startsWith('design/')) continue;
	const path = rel === 'index' ? '/' : `/${rel.replace(/(^|\/)index$/, '')}/`.replace(/\/+/g, '/');
	const date = git('log', '-1', '--format=%cs', '--', file);
	pages[path] = date || today;
}
for (const file of walk('src/content').filter((f) => /\.mdx?$/.test(f))) {
	const rel = posix(relative('src/content', file)).replace(/\.mdx?$/, '');
	pages[`/${rel}/`] = git('log', '-1', '--format=%cs', '--', file) || today;
}

// Strip the fields that change on re-verification, then compare values commit by commit.
function values(json) {
	const strip = (node) => {
		if (Array.isArray(node)) return node.map(strip);
		if (node && typeof node === 'object') {
			const out = {};
			for (const [k, v] of Object.entries(node)) if (!['verified', 'archived', 'note'].includes(k)) out[k] = strip(v);
			return out;
		}
		return node;
	};
	return JSON.stringify(strip(JSON.parse(json)));
}

const rules = {};
for (const file of readdirSync(CONFIG).filter((f) => /^\d{4}-\d{2}\.json$/.test(f))) {
	const year = file.replace('.json', '');
	const path = `${CONFIG}/${file}`;
	const commits = git('log', '--format=%H %cs', '--', path).split('\n').filter(Boolean);
	let date = today;
	if (commits.length) {
		date = commits[0].split(' ')[1];
		let current = values(git('show', `${commits[0].split(' ')[0]}:${path}`));
		for (let i = 1; i < commits.length; i++) {
			const [hash, when] = commits[i].split(' ');
			const older = values(git('show', `${hash}:${path}`));
			if (older !== current) break;
			date = when;
		}
		// If no older commit differs, the earliest commit set the values.
		if (commits.length > 1) {
			const first = commits.at(-1);
			if (values(git('show', `${first.split(' ')[0]}:${path}`)) === current) date = first.split(' ')[1];
		}
	}
	rules[year] = date;
}

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/lastmod.json', JSON.stringify({ generated: today, pages, rules }, null, '\t') + '\n');
console.log(`lastmod: ${Object.keys(pages).length} pages, ${Object.keys(rules).length} tax years`);
