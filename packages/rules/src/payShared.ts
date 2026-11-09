// Shared pieces for the pay tools: reading a take-home breakdown into a
// simple result, optional config values, the line comparing with the next
// tax year, income tax on a figure, statutory weekly pay and counting the
// weeks of a tax year.

import { nextYear, provenanceOf, resolve } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, money, nationBands, taxOnTop, Used } from './simple.ts';
import { RulesUnavailableError, type BandResult, type Breakdown, type Leaf, type Nation, type Plan, type Provenance, type SimpleResult, type YearComparison, type YearConfig } from './types.ts';

/** Config paths behind a take-home figure, for the pay tools. */
export const PAY_TOUCHES = /^(incomeTax\.(personalAllowance|taperStart|bands\.)|nationalInsurance\.employee\.(mainRate|upperRate|primaryThreshold|upperEarningsLimit)$|studentLoans\.)/;

export type PlanChoice = Plan | 'none' | null | undefined;

export function plansOf(plan: PlanChoice): Plan[] {
	return plan && plan !== 'none' ? [plan] : [];
}

/** Carries the sources, dates and status of a take-home breakdown into a simple result. */
export function useBreakdown(used: Used, b: Breakdown): void {
	for (const s of b.rulesUsed.sources) used.prov(s);
	used.prov({ source: '', verified: b.rulesUsed.verifiedFrom, status: b.rulesUsed.status });
}

/** Where the income tax, National Insurance and student loan lines of a breakdown came from. */
export function deductionSources(b: Breakdown, year: YearConfig): { tax: Provenance; ni: Provenance; loan: Provenance | null } {
	const taxBands = b.incomeTax.bands;
	const niBands = b.nationalInsurance.bands;
	return {
		tax: taxBands.length ? taxBands[taxBands.length - 1].provenance : provenanceOf(year.incomeTax.personalAllowance),
		ni: niBands.length ? niBands[niBands.length - 1].provenance : provenanceOf(year.nationalInsurance.employee.primaryThreshold),
		loan: b.studentLoans.plans[0]?.provenance ?? null,
	};
}

/** A config value some years do not carry. Missing or empty, it throws so the tool says so. */
export function need<T>(leaf: Leaf<T> | undefined, path: string, asAt: string, what: string): { value: T; provenance: Provenance } {
	if (!leaf) throw new RulesUnavailableError(`${path}: ${what} has not been recorded for this tax year`, path);
	return resolve(leaf, path, asAt);
}

/**
 * The same inputs under the following tax year. `run` computes the result
 * without its own comparison. `moved` says which figures differ, in words.
 */
export function nextYearLine(current: SimpleResult, year: YearConfig, run: (taxYear: string, asAt: string) => SimpleResult, noun: string, moved: (next: YearConfig) => string = () => ''): YearComparison | null {
	const next = nextYear(year.taxYear);
	if (!next) return null;
	try {
		const then = run(next.taxYear, next.starts);
		const difference = round2(then.headline.amount - current.headline.amount);
		let why = '';
		try {
			why = moved(next);
		} catch {
			why = '';
		}
		const sentence =
			Math.abs(difference) < 0.005
				? `Under ${next.label} as announced so far, the same inputs give the same ${noun}, ${money(then.headline.amount)}. ${why || 'None of the rules this result used is set to change.'}`
				: `Under ${next.label} as announced so far, the same inputs give ${money(then.headline.amount)} of ${noun}, ${money(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than in ${year.label}. ${why}`.trim();
		return { taxYear: next.taxYear, label: next.label, amount: then.headline.amount, difference, sentence };
	} catch (e) {
		if (e instanceof RulesUnavailableError) {
			return { taxYear: next.taxYear, label: next.label, amount: null, difference: null, sentence: `Under ${next.label} this result cannot be shown yet: ${e.message.replace(/^[\w.[\]-]+: /, '').replace(/\.$/, '')}.` };
		}
		throw e;
	}
}

/** Income tax on a year's income at the nation's bands, after the personal allowance. */
export function incomeTaxOn(income: number, year: YearConfig, nation: Nation, asAt: string, used: Used): { total: number; slices: BandResult[] } {
	const pa = allowanceFor(income, year, asAt, used);
	const taxable = floorPound(Math.max(0, income - pa.allowance));
	return taxOnTop(taxable, 0, nationBands(year, nation, used));
}

/** Up to the next whole penny, as the statutory pay regulations round a weekly payment. */
export function ceilPenny(n: number): number {
	return Math.ceil(n * 100 - 1e-7) / 100;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** How many weeks beginning on `day` start between two ISO dates, both included. */
export function weeksStarting(day: string, starts: string, ends: string): number {
	const want = DAYS.indexOf(day);
	if (want < 0) throw new Error(`Unknown day ${day}`);
	const first = new Date(`${starts}T00:00:00Z`);
	const last = new Date(`${ends}T00:00:00Z`);
	const offset = (want - first.getUTCDay() + 7) % 7;
	const days = Math.round((last.getTime() - first.getTime()) / 86400000) - offset;
	return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

export const miles = (n: number) => n.toLocaleString('en-GB');
export const pence = (rate: number) => `${+(rate * 100).toFixed(2)}p`;
