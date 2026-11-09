// An hourly rate as a salary: rate × hours a week × weeks a year, then the
// take-home breakdown on that salary a year, a month and a week.

import { getYear, resolve, today, yearFor } from './config.ts';
import { round2 } from './rounding.ts';
import { nextYearLine, plansOf, useBreakdown, type PlanChoice } from './payShared.ts';
import { asAtWithin, longDate, money, money0, Used } from './simple.ts';
import { takeHome } from './takeHome.ts';
import type { LedgerLine, Nation, SimpleResult, YearConfig } from './types.ts';

export interface HourlyToSalaryInput {
	/** Pay for an hour, before tax. */
	rate: number;
	/** Paid hours in a week. */
	hours: number;
	/** Paid weeks in a year, holidays included when they are paid. */
	weeks: number;
	nation: Nation;
	plan?: PlanChoice;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export function hourlyToSalary(input: HourlyToSalaryInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const rate = Math.max(0, round2(input.rate || 0));
	const hours = Math.min(168, Math.max(0, input.hours || 0));
	const weeks = Math.min(53, Math.max(0, input.weeks || 0));
	const plans = plansOf(input.plan);
	const used = new Used();
	const lines: LedgerLine[] = [];

	const salary = round2(rate * hours * weeks);
	const b = takeHome({ gross: salary, nation: input.nation, studentLoanPlans: plans, taxYear: year.taxYear, asAt }, { withMarginal: false });
	useBreakdown(used, b);
	const warnings = [...b.warnings];

	const n = (x: number) => String(+x.toFixed(2));
	lines.push({ id: 'hourly', label: 'Hourly pay as a salary', kind: 'income', rate: null, slice: null, amount: salary, sign: 1, provenance: null, arithmetic: `${money(rate)} × ${n(hours)} hours a week × ${n(weeks)} weeks a year = ${money(salary)}.` });
	lines.push(...b.lines.filter((l) => l.id !== 'gross'));

	// The hourly minimum for the oldest age group, where the year records it.
	const wage = year.minimumWage;
	if (wage && rate > 0 && asAt >= wage.effectiveFrom) {
		const floor = resolve(wage.age21AndOver, 'minimumWage.age21AndOver', asAt);
		if (rate < floor.value) {
			used.add(floor);
			warnings.push(`${money(rate)} an hour is below the National Living Wage of ${money(floor.value)} for people aged 21 and over, in force from ${longDate(wage.effectiveFrom)}. Lower minimum rates apply to younger workers and apprentices.`);
		}
	}

	const perHour = hours * weeks > 0 ? round2(b.takeHome / (hours * weeks)) : 0;
	const result: SimpleResult = {
		tool: 'hourly-to-salary',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Take-home pay', amount: b.periods.monthly, unit: 'a month' },
		figures: [
			{ label: 'Salary a year', amount: salary },
			{ label: 'Take-home a year', amount: b.takeHome },
			{ label: 'Take-home a week', amount: b.periods.weekly },
		],
		note: salary === 0 ? 'Enter an hourly rate, the hours in a week and the weeks in a year.' : `${money(rate)} an hour for ${n(hours)} hours over ${n(weeks)} weeks is ${money0(salary)} a year before tax and ${money(perHour)} an hour after income tax${b.studentLoans.total > 0 ? ', National Insurance and student loan repayments' : ' and National Insurance'}. The weekly figure is the year's take-home divided by 52.`,
		lines,
		caption: `How ${money(rate)} an hour becomes take-home pay in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { salary, takeHome: b.takeHome, monthly: b.periods.monthly, weekly: b.periods.weekly, incomeTax: b.incomeTax.total, nationalInsurance: b.nationalInsurance.total, studentLoan: b.studentLoans.total, perHour },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(result, year, (taxYear, at) => hourlyToSalary({ ...input, taxYear, asAt: at, compare: false }), 'take-home pay a month');
	}
	return result;
}
