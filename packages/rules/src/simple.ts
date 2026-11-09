// Shared pieces for the single-purpose tools: the personal allowance after
// the taper, tax on a slice of income stacked on top of other income, the
// rules used box, and the line comparing this year with the next.

import { compareYears } from './changes.ts';
import { leastSettled, nextYear, provenanceOf, resolve } from './config.ts';
import { bandsFor } from './incomeTax.ts';
import { floorPound, round2 } from './rounding.ts';
import { NATION_LABEL, RulesUnavailableError, type Band, type BandResult, type Leaf, type LedgerLine, type Nation, type Provenance, type RulesUsed, type SimpleResult, type Status, type YearComparison, type YearConfig } from './types.ts';

export const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
export const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10-29" as "29 October 2026". */
export const longDate = (iso: string) => {
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

/** The date the rules are read as at, never before the chosen year starts, so a later year is read under its own rules. */
export function asAtWithin(asAt: string, year: YearConfig): string {
	return asAt < year.starts ? year.starts : asAt;
}

/** Collects the provenance of every value a result used. */
export class Used {
	readonly list: Provenance[] = [];
	add<T>(r: { value: T; provenance: Provenance }): T {
		this.list.push(r.provenance);
		return r.value;
	}
	prov(p: Provenance | null | undefined): Provenance | null {
		if (p) this.list.push(p);
		return p ?? null;
	}
	rulesUsed(year: YearConfig, nation: Nation, asAt: string): RulesUsed {
		const dates = this.list.map((p) => p.verified).filter(Boolean).sort();
		const seen = new Map<string, { source: string; verified: string; status: Status }>();
		for (const p of this.list) if (p.source && !seen.has(p.source)) seen.set(p.source, { source: p.source, verified: p.verified, status: p.status });
		return {
			taxYear: year.taxYear,
			label: year.label,
			nation,
			asAt,
			verifiedFrom: dates[0] ?? '',
			verifiedTo: dates[dates.length - 1] ?? '',
			status: leastSettled(this.list.map((p) => p.status)),
			nextChange: year.nextScheduledChange,
			sources: [...seen.values()],
		};
	}
}

export interface AllowanceOutcome {
	standard: number;
	allowance: number;
	taperedBy: number;
	taperStart: number;
	provenance: Provenance;
}

/** The standard personal allowance, reduced by the taper above the income limit. */
export function allowanceFor(adjustedNetIncome: number, year: YearConfig, asAt: string, used: Used): AllowanceOutcome {
	const pa = resolve(year.incomeTax.personalAllowance, 'incomeTax.personalAllowance', asAt);
	const start = resolve(year.incomeTax.taperStart, 'incomeTax.taperStart', asAt);
	const rate = resolve(year.incomeTax.taperRate, 'incomeTax.taperRate', asAt).value;
	used.add(pa);
	if (adjustedNetIncome <= start.value) return { standard: pa.value, allowance: pa.value, taperedBy: 0, taperStart: start.value, provenance: pa.provenance };
	used.add(start);
	const reduction = Math.min(pa.value, floorPound((adjustedNetIncome - start.value) * rate));
	return { standard: pa.value, allowance: pa.value - reduction, taperedBy: reduction, taperStart: start.value, provenance: start.provenance };
}

export function allowanceLine(a: AllowanceOutcome, usedOn: string, amountUsed: number, adjustedNetIncome: number): LedgerLine {
	return {
		id: 'allowance',
		label: a.taperedBy > 0 ? `Personal allowance (reduced above ${money0(a.taperStart)})` : 'Personal allowance',
		kind: 'allowance',
		rate: null,
		slice: null,
		amount: amountUsed,
		sign: 0,
		provenance: a.provenance,
		arithmetic:
			(a.taperedBy > 0
				? `The standard allowance of ${money(a.standard)} falls by half of the ${money(adjustedNetIncome - a.taperStart)} of income above ${money0(a.taperStart)}, to ${money(a.allowance)}. `
				: `The standard allowance is ${money(a.allowance)}. `) + (amountUsed > 0 ? `${money(amountUsed)} of it is set against ${usedOn} at 0%.` : `All of it is used by other income, so none is left for ${usedOn}.`),
	};
}

export interface RateBand {
	name: string;
	upTo: number | null;
	rate: number;
	provenance: Provenance;
}

/** The UK band limits with the rates for a kind of income (savings or property). */
export function bandsWithRates(year: YearConfig, rates: { basic: Leaf; higher: Leaf; additional: Leaf }, asAt: string, prefix: string, used: Used): RateBand[] {
	const limits = bandsFor(year, 'england-ni');
	const keys = ['basic', 'higher', 'additional'] as const;
	return limits.slice(0, 3).map((b, i) => {
		const r = resolve(rates[keys[i]], `${prefix}.${keys[i]}`, asAt);
		used.add(r);
		return { name: `${prefix.includes('savings') ? 'Savings' : 'Property'} ${keys[i]} rate`, upTo: i === 2 ? null : b.upTo, rate: r.value, provenance: r.provenance };
	});
}

/** A nation's own bands (non-savings income), as rate bands. */
export function nationBands(year: YearConfig, nation: Nation, used: Used): RateBand[] {
	return bandsFor(year, nation).map((b: Band) => {
		const p = provenanceOf(b);
		used.prov(p);
		return { name: b.name, upTo: b.upTo, rate: b.rate as number, provenance: p };
	});
}

/** Tax on `amount` of income sitting on top of `below` of taxable income already in the bands. */
export function taxOnTop(amount: number, below: number, bands: RateBand[]): { total: number; slices: BandResult[] } {
	const slices: BandResult[] = [];
	const top = below + amount;
	let lower = 0;
	for (const b of bands) {
		const upper = b.upTo ?? Infinity;
		const from = Math.max(lower, below);
		const to = Math.min(upper, top);
		const slice = Math.max(0, to - from);
		if (slice > 0) slices.push({ name: b.name, rate: b.rate, from, to: b.upTo === null ? null : to, slice, tax: round2(slice * b.rate), provenance: b.provenance });
		lower = upper;
		if (top <= upper) break;
	}
	return { total: round2(slices.reduce((s, b) => s + b.tax, 0)), slices };
}

export function sliceLines(slices: BandResult[], idPrefix: string, labelPrefix: string, what: string): LedgerLine[] {
	return slices.map((s) => ({
		id: `${idPrefix}-${s.name.toLowerCase().replace(/\s+/g, '-')}`,
		label: `${labelPrefix}: ${s.name.toLowerCase()}`,
		kind: 'band',
		rate: s.rate,
		slice: s.slice,
		amount: s.tax,
		sign: -1,
		provenance: s.provenance,
		arithmetic: `${what} from ${money(s.from)} to ${s.to === null ? 'the top' : money(s.to)} of taxable income: ${money(s.slice)} × ${pct(s.rate)} = ${money(s.tax)}.`,
	}));
}

const PATH_LABELS: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
	[/^incomeTax\.savings\.rates\.(\w+)$/, (m) => `the savings ${m[1]} rate`],
	[/^incomeTax\.savings\.personalSavingsAllowance\.(\w+)$/, (m) => `the personal savings allowance for ${m[1]} rate taxpayers`],
	[/^incomeTax\.savings\.startingRateLimit$/, 'the starting rate for savings'],
	[/^incomeTax\.property\.rates\.(\w+)$/, (m) => `the property ${m[1]} rate`],
	[/^incomeTax\.property\.financeCostReliefRate$/, 'the finance cost relief rate'],
	[/^incomeTax\.property\.financeCostReliefBasis$/, 'the rate finance cost relief is given at'],
	[/^incomeTax\.property\.rentARoom(Shared)?Limit$/, (m) => (m[1] ? 'the rent a room limit when the income is shared' : 'the rent a room limit')],
	[/^incomeTax\.propertyAllowance$/, 'the property allowance'],
	[/^incomeTax\.tradingAllowance$/, 'the trading allowance'],
	[/^incomeTax\.personalAllowance$/, 'the personal allowance'],
	[/^incomeTax\.taperStart$/, 'the income limit for the personal allowance'],
	[/^incomeTax\.bands\.([a-z-]+)\[(\d+)\]\.(upTo|rate)$/, (m) => `${NATION_LABEL[m[1] as Nation] ?? m[1]} band ${Number(m[2]) + 1} ${m[3] === 'upTo' ? 'limit' : 'rate'}`],
	[/^pensionTaxAllowance\.fullNewStatePension$/, 'the full new State Pension'],
	[/^pensionTaxAllowance\.rate$/, 'the Pension Tax Allowance rate'],
	[/^nationalInsurance\.selfEmployed\.class4\.(\w+)$/, (m) => `the Class 4 ${m[1].replace(/([A-Z])/g, ' $1').toLowerCase()}`],
	[/^isa\.lifetimeIsa\.(\w+)$/, (m) => `the Lifetime ISA ${m[1].replace(/([A-Z])/g, ' $1').toLowerCase()}`],
];

export function pathLabel(path: string): string {
	for (const [re, label] of PATH_LABELS) {
		const m = path.match(re);
		if (m) return typeof label === 'string' ? label : label(m);
	}
	return path;
}

const fmt = (v: number | string | null) => (typeof v === 'number' ? (v < 1 ? pct(v) : money0(v)) : String(v ?? 'not set'));

/** "The savings basic rate moved from 20% to 24%; ..." for the changes that touch a tool. */
export function describeChanges(from: YearConfig, to: YearConfig, touches: RegExp, limit = 3): string {
	const changes = compareYears(from, to).filter((c) => touches.test(c.path) && c.to !== null);
	const parts = changes.slice(0, limit).map((c) => `${pathLabel(c.path)} moved from ${fmt(c.from)} to ${fmt(c.to)}`);
	return parts.length ? parts.join('; ').replace(/^(.)/, (m) => m.toUpperCase()) + '.' : '';
}

/**
 * The same inputs under the following tax year. `run` computes the result for
 * a tax year and an as-at date without its own comparison, so this cannot recurse.
 */
export function compareWithNext(current: SimpleResult, year: YearConfig, touches: RegExp, run: (taxYear: string, asAt: string) => SimpleResult, noun = 'tax'): YearComparison | null {
	const next = nextYear(year.taxYear);
	if (!next) return null;
	try {
		const then = run(next.taxYear, next.starts);
		const difference = round2(then.headline.amount - current.headline.amount);
		const moved = describeChanges(year, next, touches);
		let sentence: string;
		if (Math.abs(difference) < 0.005) sentence = `Under ${next.label} as announced so far, the same inputs give the same ${noun}, ${money(then.headline.amount)}. ${moved || `None of the rules this result used is set to change.`}`;
		else sentence = `Under ${next.label} as announced so far, the same inputs give ${money(then.headline.amount)} of ${noun}, ${money(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than in ${year.label}. ${moved}`.trim();
		return { taxYear: next.taxYear, label: next.label, amount: then.headline.amount, difference, sentence };
	} catch (e) {
		if (e instanceof RulesUnavailableError) {
			return { taxYear: next.taxYear, label: next.label, amount: null, difference: null, sentence: `Under ${next.label} this result cannot be shown yet: ${e.message.replace(/^[\w.[\]-]+: /, '')}` };
		}
		throw e;
	}
}
