// Statutory Maternity Pay and Statutory Paternity Pay from average weekly
// earnings. Maternity pay is the earnings rate for the first weeks, then
// the lower of the weekly rate and the earnings rate. Paternity pay is the
// lower of the two for each week. A weekly amount with a fraction of a
// penny is rounded up to the next penny, as the regulations require.

import { getYear, resolve, today, yearFor } from './config.ts';
import { round2 } from './rounding.ts';
import { ceilPenny, need, nextYearLine } from './payShared.ts';
import { asAtWithin, money, pct, Used } from './simple.ts';
import { RulesUnavailableError, type Leaf, type LedgerLine, type Provenance, type SimpleResult, type YearConfig } from './types.ts';

export interface MaternityPayInput {
	/** Average weekly earnings before tax, over the relevant period before the qualifying week. */
	weeklyEarnings: number;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export interface PaternityPayInput {
	weeklyEarnings: number;
	/** Weeks of paternity pay taken. Defaults to the most the rules allow. */
	weeks?: number;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const MATERNITY_TOUCHES = /^statutoryPay\.smp\./;
export const PATERNITY_TOUCHES = /^statutoryPay\.spp\./;

/** The earnings test, where the year records it. */
function earningsTest(leaf: Leaf | undefined, path: string, asAt: string, used: Used, warnings: string[], what: string): { value: number; provenance: Provenance } | null {
	try {
		const t = need(leaf, path, asAt, 'The earnings test');
		used.add(t);
		return t;
	} catch (e) {
		if (e instanceof RulesUnavailableError) {
			warnings.push(`The average weekly earnings needed to qualify for ${what} in this tax year are not recorded, so the result assumes the test is met.`);
			return null;
		}
		throw e;
	}
}

export function maternityPay(input: MaternityPayInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const earnings = Math.max(0, round2(input.weeklyEarnings || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];
	const smp = year.statutoryPay.smp;
	if (!smp) throw new RulesUnavailableError(`statutoryPay.smp: The Statutory Maternity Pay rates for ${year.label} have not been recorded`, 'statutoryPay.smp');

	const cap = resolve(smp.weekly, 'statutoryPay.smp.weekly', asAt);
	const fraction = resolve(smp.earningsFraction, 'statutoryPay.smp.earningsFraction', asAt);
	const fullWeeks = resolve(smp.fullRateWeeks, 'statutoryPay.smp.fullRateWeeks', asAt);
	const maxWeeks = need(smp.maxWeeks, 'statutoryPay.smp.maxWeeks', asAt, 'The number of weeks Statutory Maternity Pay is paid for');
	used.add(cap);
	used.add(fraction);
	used.add(fullWeeks);
	used.add(maxWeeks);
	const test = earningsTest(smp.earningsTestWeekly, 'statutoryPay.smp.earningsTestWeekly', asAt, used, warnings, 'Statutory Maternity Pay');
	const eligible = earnings > 0 && (!test || earnings >= test.value);

	const laterWeeks = maxWeeks.value - fullWeeks.value;
	const earningsRate = ceilPenny(earnings * fraction.value);
	const firstWeekly = eligible ? earningsRate : 0;
	const laterWeekly = eligible ? Math.min(cap.value, earningsRate) : 0;
	const firstTotal = round2(firstWeekly * fullWeeks.value);
	const laterTotal = round2(laterWeekly * laterWeeks);
	const total = round2(firstTotal + laterTotal);

	lines.push({ id: 'earnings', label: 'Average weekly earnings', kind: 'info', rate: null, slice: null, amount: earnings, sign: 0, provenance: null, arithmetic: `Average pay before tax over the weeks an employer looks at before the qualifying week: ${money(earnings)} a week.` });
	if (test) {
		lines.push({ id: 'test', label: 'Earnings needed to qualify', kind: 'info', rate: null, slice: null, amount: test.value, sign: 0, provenance: test.provenance, arithmetic: earnings >= test.value ? `${money(earnings)} a week is at least the ${money(test.value)} needed.` : `${money(earnings)} a week is below the ${money(test.value)} needed, so Statutory Maternity Pay is not due.` });
	}
	lines.push({
		id: 'first-weeks',
		label: `Weeks 1 to ${fullWeeks.value}`,
		kind: 'income',
		rate: fraction.value,
		slice: earnings,
		amount: firstTotal,
		sign: 1,
		provenance: fraction.provenance,
		arithmetic: eligible ? `${pct(fraction.value)} of ${money(earnings)} is ${money(firstWeekly)} a week, with no upper limit. ${fullWeeks.value} weeks × ${money(firstWeekly)} = ${money(firstTotal)}.` : 'Not due.',
	});
	lines.push({
		id: 'later-weeks',
		label: `Weeks ${fullWeeks.value + 1} to ${maxWeeks.value}`,
		kind: 'income',
		rate: eligible && laterWeekly < cap.value ? fraction.value : null,
		slice: eligible && laterWeekly < cap.value ? earnings : null,
		amount: laterTotal,
		sign: 1,
		provenance: cap.provenance,
		arithmetic: eligible
			? `The lower of the ${money(cap.value)} weekly rate and ${pct(fraction.value)} of earnings (${money(earningsRate)}) is ${money(laterWeekly)} a week. ${laterWeeks} weeks × ${money(laterWeekly)} = ${money(laterTotal)}.`
			: 'Not due.',
	});
	lines.push({ id: 'total', label: `Statutory Maternity Pay over ${maxWeeks.value} weeks`, kind: 'total', rate: null, slice: null, amount: total, sign: 1, provenance: null, arithmetic: `${money(firstTotal)} + ${money(laterTotal)} = ${money(total)}, before income tax and National Insurance.` });

	const note =
		earnings === 0
			? 'Enter average weekly earnings before tax.'
			: !eligible
				? `Average weekly earnings of ${money(earnings)} are below the ${money(test!.value)} needed for Statutory Maternity Pay. Maternity Allowance is a separate benefit with its own test.`
				: `${money(firstWeekly)} a week for the first ${fullWeeks.value} weeks, then ${money(laterWeekly)} a week for the next ${laterWeeks}. Income tax and National Insurance are taken from it like pay.`;

	const result: SimpleResult = {
		tool: 'maternity-pay',
		taxYear: year.taxYear,
		label: year.label,
		nation: 'england-ni',
		asAt,
		headline: { label: 'Statutory Maternity Pay in total', amount: total, unit: `over ${maxWeeks.value} weeks` },
		figures: [
			{ label: `A week, weeks 1 to ${fullWeeks.value}`, amount: firstWeekly, pence: true },
			{ label: `A week, weeks ${fullWeeks.value + 1} to ${maxWeeks.value}`, amount: laterWeekly, pence: true },
			{ label: 'Average a week', amount: round2(total / maxWeeks.value), pence: true },
		],
		note,
		lines,
		caption: `Statutory Maternity Pay week by week on average earnings of ${money(earnings)} a week at the ${year.label} rates`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, 'england-ni', asAt),
		warnings,
		facts: { firstWeekly, laterWeekly, firstTotal, laterTotal, total, weeks: maxWeeks.value, eligible: eligible ? 'yes' : 'no' },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(result, year, (taxYear, at) => maternityPay({ ...input, taxYear, asAt: at, compare: false }), 'Statutory Maternity Pay');
	}
	return result;
}

export function paternityPay(input: PaternityPayInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const earnings = Math.max(0, round2(input.weeklyEarnings || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];
	const spp = year.statutoryPay.spp;
	if (!spp) throw new RulesUnavailableError(`statutoryPay.spp: The Statutory Paternity Pay rates for ${year.label} have not been recorded`, 'statutoryPay.spp');

	const cap = resolve(spp.weekly, 'statutoryPay.spp.weekly', asAt);
	const fraction = resolve(spp.earningsFraction, 'statutoryPay.spp.earningsFraction', asAt);
	const maxWeeks = resolve(spp.maxWeeks, 'statutoryPay.spp.maxWeeks', asAt);
	used.add(cap);
	used.add(fraction);
	used.add(maxWeeks);
	const asked = input.weeks === undefined || !Number.isFinite(input.weeks) || input.weeks <= 0 ? maxWeeks.value : Math.floor(input.weeks);
	const weeks = Math.min(maxWeeks.value, Math.max(1, asked));
	if (asked > maxWeeks.value) warnings.push(`Statutory Paternity Pay is paid for up to ${maxWeeks.value} weeks, so ${maxWeeks.value} are shown.`);
	const test = earningsTest(spp.earningsTestWeekly, 'statutoryPay.spp.earningsTestWeekly', asAt, used, warnings, 'Statutory Paternity Pay');
	const eligible = earnings > 0 && (!test || earnings >= test.value);

	const earningsRate = ceilPenny(earnings * fraction.value);
	const weekly = eligible ? Math.min(cap.value, earningsRate) : 0;
	const total = round2(weekly * weeks);

	lines.push({ id: 'earnings', label: 'Average weekly earnings', kind: 'info', rate: null, slice: null, amount: earnings, sign: 0, provenance: null, arithmetic: `Average pay before tax over the weeks an employer looks at before the qualifying week: ${money(earnings)} a week.` });
	if (test) {
		lines.push({ id: 'test', label: 'Earnings needed to qualify', kind: 'info', rate: null, slice: null, amount: test.value, sign: 0, provenance: test.provenance, arithmetic: earnings >= test.value ? `${money(earnings)} a week is at least the ${money(test.value)} needed.` : `${money(earnings)} a week is below the ${money(test.value)} needed, so Statutory Paternity Pay is not due.` });
	}
	lines.push({
		id: 'weekly',
		label: 'Paternity pay for a week',
		kind: 'income',
		rate: eligible && weekly < cap.value ? fraction.value : null,
		slice: eligible && weekly < cap.value ? earnings : null,
		amount: weekly,
		sign: 1,
		provenance: cap.provenance,
		arithmetic: eligible ? `The lower of the ${money(cap.value)} weekly rate and ${pct(fraction.value)} of earnings (${money(earningsRate)}) is ${money(weekly)}.` : 'Not due.',
	});
	lines.push({ id: 'total', label: `Statutory Paternity Pay for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`, kind: 'total', rate: null, slice: null, amount: total, sign: 1, provenance: null, arithmetic: `${weeks} × ${money(weekly)} = ${money(total)}, before income tax and National Insurance.` });

	const note =
		earnings === 0
			? 'Enter average weekly earnings before tax.'
			: !eligible
				? `Average weekly earnings of ${money(earnings)} are below the ${money(test!.value)} needed for Statutory Paternity Pay.`
				: `${money(weekly)} a week for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}. Up to ${maxWeeks.value} weeks can be taken, together or one at a time. Income tax and National Insurance are taken from it like pay.`;

	const result: SimpleResult = {
		tool: 'paternity-pay',
		taxYear: year.taxYear,
		label: year.label,
		nation: 'england-ni',
		asAt,
		headline: { label: 'Statutory Paternity Pay', amount: total, unit: `for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}` },
		figures: [
			{ label: 'A week', amount: weekly, pence: true },
			{ label: 'Statutory weekly rate', amount: cap.value, pence: true },
			{ label: `${pct(fraction.value)} of your earnings`, amount: earningsRate, pence: true },
		],
		note,
		lines,
		caption: `Statutory Paternity Pay on average earnings of ${money(earnings)} a week at the ${year.label} rates`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, 'england-ni', asAt),
		warnings,
		facts: { weekly, total, weeks, eligible: eligible ? 'yes' : 'no' },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(result, year, (taxYear, at) => paternityPay({ ...input, taxYear, asAt: at, compare: false }), 'Statutory Paternity Pay');
	}
	return result;
}
