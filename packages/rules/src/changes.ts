// What changed between two tax years, for the "what changed" line and the
// changelog on the rates pages.

import { getYear, previousYear } from './config.ts';
import { round2 } from './rounding.ts';
import { takeHome } from './takeHome.ts';
import type { TakeHomeInput, YearConfig } from './types.ts';

export interface ValueChange {
	path: string;
	from: number | string | null;
	to: number | string | null;
	source: string;
	status: string;
}

function isLeaf(x: unknown): x is { value: unknown; source: string; status: string } {
	return !!x && typeof x === 'object' && 'value' in (x as object) && 'source' in (x as object);
}

function walk(a: unknown, b: unknown, path: string, out: ValueChange[]) {
	if (isLeaf(a) || isLeaf(b)) {
		const av = isLeaf(a) ? a.value : null;
		const bv = isLeaf(b) ? b.value : null;
		if (av !== bv) out.push({ path, from: av as number | string | null, to: bv as number | string | null, source: isLeaf(b) ? b.source : '', status: isLeaf(b) ? b.status : 'unset' });
		return;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		const aa = Array.isArray(a) ? a : [];
		const bb = Array.isArray(b) ? b : [];
		const n = Math.max(aa.length, bb.length);
		for (let i = 0; i < n; i++) {
			const x = aa[i] as Record<string, unknown> | undefined;
			const y = bb[i] as Record<string, unknown> | undefined;
			// Bands: compare upTo and rate.
			if ((x && 'rate' in x) || (y && 'rate' in y)) {
				for (const k of ['upTo', 'rate'] as const) {
					if ((x?.[k] ?? null) !== (y?.[k] ?? null)) out.push({ path: `${path}[${i}].${k}`, from: (x?.[k] as number) ?? null, to: (y?.[k] as number) ?? null, source: (y?.source as string) ?? '', status: (y?.status as string) ?? 'unset' });
				}
			} else walk(x, y, `${path}[${i}]`, out);
		}
		return;
	}
	if (a && typeof a === 'object' && b && typeof b === 'object') {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) {
			if (['taxYear', 'label', 'starts', 'ends', 'nextScheduledChange', 'effectiveFrom'].includes(k) && path === '') continue;
			walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out);
		}
		return;
	}
	if (a !== b && (a === null || b === null || typeof a !== 'object')) {
		if (path && !path.endsWith('effectiveFrom')) out.push({ path, from: (a as number | string | null) ?? null, to: (b as number | string | null) ?? null, source: '', status: 'unset' });
	}
}

/** Every value that differs between two years, by config path. */
export function compareYears(fromYear: YearConfig, toYear: YearConfig): ValueChange[] {
	const out: ValueChange[] = [];
	walk(fromYear, toYear, '', out);
	return out;
}

export interface YearOnYear {
	thisYear: string;
	lastYear: string;
	takeHomeNow: number;
	takeHomeThen: number;
	difference: number;
	sentence: string;
	changes: ValueChange[];
}

/** The same inputs under this year and last year, with a two-sentence summary. */
export function yearOnYear(input: TakeHomeInput): YearOnYear | null {
	const now = takeHome(input, { withMarginal: false });
	const prev = previousYear(now.taxYear);
	if (!prev) return null;
	let then;
	try {
		then = takeHome({ ...input, taxYear: prev.taxYear, asAt: prev.ends }, { withMarginal: false });
	} catch {
		return null;
	}
	const difference = round2(now.takeHome - then.takeHome);
	const relevant = compareYears(prev, getYear(now.taxYear)).filter((c) => {
		if (c.path.startsWith('incomeTax.personalAllowance') || c.path.startsWith('incomeTax.taper')) return true;
		if (c.path.startsWith(`incomeTax.bands.${input.nation}`)) return true;
		if (/^nationalInsurance\.employee\.(primaryThreshold|upperEarningsLimit|mainRate|upperRate)$/.test(c.path)) return true;
		return (input.studentLoanPlans ?? []).some((p) => c.path.startsWith(`studentLoans.${p}`));
	});
	const money = (n: number) => '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	let sentence: string;
	if (Math.abs(difference) < 0.5) {
		sentence = `On the same pay, take-home is unchanged from ${prev.label}. ${relevant.length ? 'The rules that apply to this result moved, but not at this income.' : 'None of the rules that apply to this result changed.'}`;
	} else {
		sentence = `On the same pay, take-home is ${money(difference)} a year ${difference > 0 ? 'higher' : 'lower'} than in ${prev.label}. ${describe(relevant)}`;
	}
	return { thisYear: now.taxYear, lastYear: prev.taxYear, takeHomeNow: now.takeHome, takeHomeThen: then.takeHome, difference, sentence, changes: relevant };
}

function describe(changes: ValueChange[]): string {
	const parts: string[] = [];
	const fmt = (v: number | string | null) => (typeof v === 'number' ? (v < 1 ? `${+(v * 100).toFixed(2)}%` : '£' + v.toLocaleString('en-GB')) : String(v ?? 'not set'));
	for (const c of changes.slice(0, 3)) {
		const name = c.path
			.replace(/^incomeTax\.bands\.[a-z-]+\[(\d+)\]\.(upTo|rate)$/, (_, i, k) => `band ${Number(i) + 1} ${k === 'upTo' ? 'limit' : 'rate'}`)
			.replace(/^incomeTax\.personalAllowance$/, 'the personal allowance')
			.replace(/^nationalInsurance\.employee\.(\w+)$/, (_, k) => `the National Insurance ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
			.replace(/^studentLoans\.(\w+)\.threshold$/, (_, p) => `the ${p.replace('plan', 'Plan ')} threshold`)
			.replace(/^studentLoans\.(\w+)\.rate$/, (_, p) => `the ${p.replace('plan', 'Plan ')} rate`);
		parts.push(`${name} moved from ${fmt(c.from)} to ${fmt(c.to)}`);
	}
	return parts.length ? parts.join('; ').replace(/^(.)/, (m) => m.toUpperCase()) + '.' : '';
}
