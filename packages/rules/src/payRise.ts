// A pay rise: take-home before and after, what the rise adds a year and a
// month, the share of it kept, and every threshold the rise crosses.

import { getYear, today, yearFor } from './config.ts';
import { round2 } from './rounding.ts';
import { deductionSources, nextYearLine, plansOf, useBreakdown, type PlanChoice } from './payShared.ts';
import { asAtWithin, money, money0, pct, Used } from './simple.ts';
import { takeHome } from './takeHome.ts';
import { nextThresholdFor, thresholdsFor } from './thresholds.ts';
import { PLAN_LABEL, type LedgerLine, type Nation, type SimpleResult, type YearConfig } from './types.ts';

export interface PayRiseInput {
	/** Salary now, a year, before tax. */
	salary: number;
	/** Salary after the rise. Used when given and above zero. */
	newSalary?: number;
	/** The rise as a percentage of the current salary, e.g. 5 for 5%. Used when `newSalary` is not given. */
	risePercent?: number;
	nation: Nation;
	plan?: PlanChoice;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export function payRise(input: PayRiseInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const salary = Math.max(0, round2(input.salary || 0));
	const byPercent = !(input.newSalary && input.newSalary > 0);
	const percent = Math.max(0, input.risePercent || 0);
	const asked = byPercent ? round2(salary * (1 + percent / 100)) : round2(input.newSalary as number);
	const plans = plansOf(input.plan);
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	const newSalary = Math.max(salary, asked);
	if (asked < salary) warnings.push(`The new salary of ${money(asked)} is lower than the current one, so no rise is shown.`);
	const rise = round2(newSalary - salary);

	const base = { nation: input.nation, studentLoanPlans: plans, taxYear: year.taxYear, asAt };
	const before = takeHome({ ...base, gross: salary }, { withMarginal: false });
	const after = takeHome({ ...base, gross: newSalary }, { withMarginal: false });
	useBreakdown(used, before);
	useBreakdown(used, after);
	for (const w of after.warnings) if (!warnings.includes(w)) warnings.push(w);
	const src = deductionSources(after, year);

	const extraTax = round2(after.incomeTax.total - before.incomeTax.total);
	const extraNi = round2(after.nationalInsurance.total - before.nationalInsurance.total);
	const extraLoan = round2(after.studentLoans.total - before.studentLoans.total);
	const netGain = round2(after.takeHome - before.takeHome);
	const keptShare = rise > 0 ? round2((netGain / rise) * 10000) / 10000 : 0;

	const thresholds = thresholdsFor(year, input.nation, plans, asAt);
	const crossed = thresholds.filter((t) => t.value > salary && t.value < newSalary);
	const next = nextThresholdFor(thresholds, newSalary);

	lines.push({ id: 'salary', label: 'Salary now', kind: 'info', rate: null, slice: null, amount: salary, sign: 0, provenance: null, arithmetic: `Take-home pay on ${money(salary)} is ${money(before.takeHome)} a year.` });
	lines.push({
		id: 'rise',
		label: 'Pay rise',
		kind: 'income',
		rate: salary > 0 ? round2((rise / salary) * 10000) / 10000 : null,
		slice: salary,
		amount: rise,
		sign: 1,
		provenance: null,
		arithmetic: byPercent ? `${money(salary)} × ${+percent.toFixed(2)}% = ${money(rise)}, making the new salary ${money(newSalary)}.` : `${money(newSalary)} − ${money(salary)} = ${money(rise)}.`,
	});
	lines.push({
		id: 'tax',
		label: 'Extra income tax',
		kind: 'deduction',
		rate: rise > 0 ? round2((extraTax / rise) * 10000) / 10000 : null,
		slice: rise,
		amount: extraTax,
		sign: -1,
		provenance: src.tax,
		arithmetic: `Income tax on ${money(salary)} is ${money(before.incomeTax.total)}; on ${money(newSalary)} it is ${money(after.incomeTax.total)}. The difference is ${money(extraTax)}.`,
	});
	lines.push({
		id: 'ni',
		label: 'Extra National Insurance',
		kind: 'deduction',
		rate: rise > 0 ? round2((extraNi / rise) * 10000) / 10000 : null,
		slice: rise,
		amount: extraNi,
		sign: -1,
		provenance: src.ni,
		arithmetic: `National Insurance on ${money(salary)} is ${money(before.nationalInsurance.total)}; on ${money(newSalary)} it is ${money(after.nationalInsurance.total)}. The difference is ${money(extraNi)}.`,
	});
	if (plans.length && src.loan) {
		lines.push({
			id: 'loan',
			label: `Extra student loan (${PLAN_LABEL[plans[0]]})`,
			kind: 'deduction',
			rate: rise > 0 ? round2((extraLoan / rise) * 10000) / 10000 : null,
			slice: rise,
			amount: extraLoan,
			sign: -1,
			provenance: src.loan,
			arithmetic: `Repayments on ${money(salary)} are ${money(before.studentLoans.total)}; on ${money(newSalary)} they are ${money(after.studentLoans.total)}. The difference is ${money(extraLoan)}.`,
		});
	}
	lines.push({ id: 'kept', label: 'Extra take-home pay', kind: 'total', rate: keptShare, slice: rise, amount: netGain, sign: 1, provenance: null, arithmetic: `${money(after.takeHome)} − ${money(before.takeHome)} = ${money(netGain)} a year, ${money(round2(netGain / 12))} a month. That is ${pct(keptShare)} of the rise.` });

	const names = crossed.map((t) => `${t.phrase} (${money0(t.value)})`);
	const note =
		rise === 0
			? 'Enter a new salary or a percentage rise.'
			: crossed.length
				? `The rise crosses ${names.join('; ')}, so part of it is charged at a higher rate than the pay below it.`
				: `The rise crosses no threshold.${next ? ` The next one above the new salary is ${next.threshold.phrase} (${money0(next.threshold.value)}).` : ''}`;

	const result: SimpleResult = {
		tool: 'pay-rise',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Extra take-home pay', amount: netGain, unit: 'a year' },
		figures: [
			{ label: 'A month', amount: round2(netGain / 12) },
			{ label: 'Share of the rise kept', amount: keptShare, rate: true },
			{ label: 'New take-home a month', amount: after.periods.monthly },
		],
		note,
		lines,
		caption: `What a rise from ${money0(salary)} to ${money0(newSalary)} adds to take-home pay in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { rise, newSalary, netGain, monthlyGain: round2(netGain / 12), keptShare, extraTax, extraNi, extraLoan, takeHomeBefore: before.takeHome, takeHomeAfter: after.takeHome, crossed: crossed.map((t) => t.id).join(',') },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(result, year, (taxYear, at) => payRise({ ...input, taxYear, asAt: at, compare: false }), 'extra take-home pay');
	}
	return result;
}
