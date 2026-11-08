// Checks every rules config: each value carries a source, a verified date,
// a status and an archived copy; nothing verified more than 180 days ago
// passes without a warning; an unset value must say why. Run by the build.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'config');
const STATUSES = new Set(['in-force', 'legislated', 'announced', 'unset']);
const SOURCE_HOSTS = ['gov.uk', 'gov.scot', 'gov.wales', 'llyw.cymru', 'revenue.scot', 'legislation.gov.uk', 'slc.co.uk', 'ons.gov.uk', 'bankofengland.co.uk'];
const STALE_DAYS = 180;
const strict = process.argv.includes('--strict');

const today = new Date();
const errors = [];
const warnings = [];

function isLeaf(x) {
	return x && typeof x === 'object' && !Array.isArray(x) && ('value' in x || 'rate' in x) && 'status' in x;
}

function checkLeaf(leaf, path, file) {
	const value = 'value' in leaf ? leaf.value : leaf.rate;
	if (!STATUSES.has(leaf.status)) errors.push(`${file} ${path}: status "${leaf.status}" is not one of ${[...STATUSES].join(', ')}`);
	if (value === null || value === undefined) {
		if (leaf.status !== 'unset') errors.push(`${file} ${path}: empty value must have status "unset"`);
		if (!leaf.note) errors.push(`${file} ${path}: empty value must carry a note saying why`);
		else warnings.push(`${file} ${path}: not set (${leaf.note})`);
		return;
	}
	if (leaf.status === 'unset') errors.push(`${file} ${path}: has a value but status "unset"`);
	if (!leaf.source) errors.push(`${file} ${path}: no source`);
	else {
		let host = '';
		try {
			host = new URL(leaf.source).hostname;
		} catch {
			errors.push(`${file} ${path}: source is not a URL (${leaf.source})`);
		}
		if (host && !SOURCE_HOSTS.some((h) => host === h || host.endsWith('.' + h))) errors.push(`${file} ${path}: source host ${host} is not a primary source`);
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(leaf.verified ?? '')) errors.push(`${file} ${path}: no verified date`);
	else {
		const age = (today - new Date(leaf.verified)) / 86400000;
		if (age > STALE_DAYS) (strict ? errors : warnings).push(`${file} ${path}: verified ${Math.round(age)} days ago (${leaf.verified})`);
	}
	if (!leaf.archived) errors.push(`${file} ${path}: no archived copy of the source (run pnpm sources:archive)`);
	else if (!existsSync(join(ROOT, leaf.archived))) errors.push(`${file} ${path}: archived copy ${leaf.archived} is missing`);
	if (leaf.previous) checkLeaf(leaf.previous, `${path}.previous`, file);
}

function walk(node, path, file) {
	if (isLeaf(node)) return checkLeaf(node, path, file);
	if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}[${i}]`, file));
	if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node)) {
			if (k === 'previous') continue;
			walk(v, path ? `${path}.${k}` : k, file);
		}
	}
}

export function checkConfigs() {
	const files = readdirSync(CONFIG).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
	if (!files.length) errors.push('no config files found');
	for (const file of files) {
		const cfg = JSON.parse(readFileSync(join(CONFIG, file), 'utf8'));
		if (cfg.taxYear !== file.replace('.json', '')) errors.push(`${file}: taxYear ${cfg.taxYear} does not match the file name`);
		for (const k of ['starts', 'ends', 'label', 'nextScheduledChange']) if (!cfg[k]) errors.push(`${file}: missing ${k}`);
		if (cfg.nextScheduledChange) {
			for (const k of ['date', 'summary', 'source', 'verified', 'status']) if (!cfg.nextScheduledChange[k]) errors.push(`${file}: nextScheduledChange.${k} missing`);
		}
		walk(cfg, '', file);
	}
	return { errors, warnings };
}

const { errors: e, warnings: w } = checkConfigs();
for (const x of w) console.warn(`warning: ${x}`);
if (e.length) {
	for (const x of e) console.error(`error: ${x}`);
	console.error(`rules check failed with ${e.length} error(s)`);
	process.exit(1);
}
console.log(`rules check passed (${w.length} warning(s))`);
