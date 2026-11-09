// Child benefit for the year and the High Income Child Benefit Charge.
// The charge is 1% of the child benefit for every step of adjusted net
// income above the start, with the child benefit total, the percentage and
// the charge each rounded down to a whole number (ITEPA 2003 s681C). A week
// of child benefit belongs to the tax year its Monday falls in (s681H).

import { getYear, resolve, today, yearFor } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { need, nextYearLine, weeksStarting } from './payShared.ts';
import { asAtWithin, money, money0, Used } from './simple.ts';
import type { LedgerLine, SimpleResult, YearConfig } from './types.ts';

export interface ChildBenefitChargeInput {
	/** Adjusted net income of the higher earner for the year. */
	income: number;
	/** Children child benefit is paid for, all year. */
	children: number;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const CHILD_BENEFIT_TOUCHES = /^childBenefit\./;

export function childBenefitCharge(input: ChildBenefitChargeInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const income = Math.max(0, round2(input.income || 0));
	const children = Math.min(20, Math.max(0, Math.floor(input.children || 0)));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];
	const cb = year.childBenefit;

	const eldest = resolve(cb.weeklyEldest, 'childBenefit.weeklyEldest', asAt);
	const additional = resolve(cb.weeklyAdditional, 'childBenefit.weeklyAdditional', asAt);
	const from = resolve(cb.chargeFrom, 'childBenefit.chargeFrom', asAt);
	const to = resolve(cb.chargeTo, 'childBenefit.chargeTo', asAt);
	const step = resolve(cb.chargeStep, 'childBenefit.chargeStep', asAt);
	const weekDay = need(cb.weekStartsOn, 'childBenefit.weekStartsOn', asAt, 'The day a week of child benefit begins');
	const rounding = need(cb.chargeRounding, 'childBenefit.chargeRounding', asAt, 'The rounding of the charge');
	used.add(eldest);
	used.add(from);
	used.add(step);
	used.add(weekDay);

	const weeks = weeksStarting(weekDay.value, year.starts, year.ends);
	const weekly = children === 0 ? 0 : round2(eldest.value + (children - 1) * additional.value);
	if (children > 1) used.add(additional);
	const benefit = round2(weeks * weekly);

	const over = Math.max(0, income - from.value);
	const percent = income >= to.value ? 100 : Math.min(100, Math.floor(over / step.value + 1e-9));
	if (percent > 0) used.add(rounding);
	if (income >= to.value) used.add(to);
	const benefitPounds = floorPound(benefit);
	const charge = floorPound((benefitPounds * percent) / 100);
	const kept = round2(benefit - charge);

	lines.push({
		id: 'benefit',
		label: 'Child benefit for the year',
		kind: 'income',
		rate: null,
		slice: null,
		amount: benefit,
		sign: 1,
		provenance: eldest.provenance,
		arithmetic:
			children === 0
				? 'No children entered, so no child benefit.'
				: `${money(eldest.value)} a week for the eldest or only child${children > 1 ? ` plus ${children - 1} × ${money(additional.value)} for the other${children > 2 ? 's' : ''}` : ''} is ${money(weekly)} a week. A week counts in the tax year its ${weekDay.value} falls in, and ${year.label} has ${weeks} of them: ${weeks} × ${money(weekly)} = ${money(benefit)}.`,
	});
	lines.push({ id: 'income', label: 'Adjusted net income', kind: 'info', rate: null, slice: null, amount: income, sign: 0, provenance: from.provenance, arithmetic: over > 0 ? `${money(income)} is ${money(over)} above the ${money0(from.value)} where the charge starts.` : `${money(income)} is not above the ${money0(from.value)} where the charge starts.` });
	lines.push({
		id: 'percent',
		label: 'Share of child benefit charged',
		kind: 'info',
		rate: percent / 100,
		slice: over,
		amount: round2((benefitPounds * percent) / 100),
		sign: 0,
		provenance: step.provenance,
		arithmetic:
			income >= to.value
				? `At ${money0(to.value)} or more the charge is 100% of the child benefit.`
				: over > 0
					? `1% for every ${money0(step.value)} above ${money0(from.value)}: ${money(over)} ÷ ${money0(step.value)} = ${+(over / step.value).toFixed(3)}, rounded down to ${percent}%.`
					: 'Nothing is charged.',
	});
	lines.push({
		id: 'charge',
		label: 'High Income Child Benefit Charge',
		kind: 'deduction',
		rate: percent / 100,
		slice: benefitPounds,
		amount: charge,
		sign: -1,
		provenance: percent > 0 ? rounding.provenance : step.provenance,
		arithmetic: percent > 0 ? `The child benefit is rounded down to ${money(benefitPounds)}. ${percent}% of it is ${money(round2((benefitPounds * percent) / 100))}, rounded down to ${money(charge)}.` : 'No charge is due.',
	});
	lines.push({ id: 'kept', label: 'Child benefit kept', kind: 'total', rate: null, slice: null, amount: kept, sign: 1, provenance: null, arithmetic: `${money(benefit)} − ${money(charge)} = ${money(kept)}.` });

	// gov.uk's calculator applies the percentage before rounding the child benefit down.
	const estimate = floorPound((benefit * percent) / 100);
	if (estimate !== charge) warnings.push(`The Child Benefit tax calculator on gov.uk applies the percentage to ${money(benefit)} before rounding, so its estimate is ${money(estimate)}. The law rounds the child benefit down to a whole pound first, which gives ${money(charge)}.`);
	if (percent > 0) warnings.push('The partner with the higher adjusted net income pays the charge. It is collected through a tax code or Self Assessment.');

	const note =
		children === 0
			? 'Enter the number of children child benefit is paid for.'
			: percent === 0
				? income <= from.value
					? `Adjusted net income of ${money0(income)} is not above ${money0(from.value)}, so there is no charge and all ${money(benefit)} is kept.`
					: `Adjusted net income of ${money0(income)} is below ${money0(from.value + step.value)}, where the first 1% is charged, so all ${money(benefit)} is kept.`
				: percent === 100
					? `At ${money0(to.value)} or more of adjusted net income the charge equals the whole of the child benefit, rounded down to the pound.`
					: `${percent}% of the child benefit is charged: 1% for every ${money0(step.value)} of adjusted net income above ${money0(from.value)}.`;

	const result: SimpleResult = {
		tool: 'child-benefit-charge',
		taxYear: year.taxYear,
		label: year.label,
		nation: 'england-ni',
		asAt,
		headline: { label: 'High Income Child Benefit Charge', amount: charge, unit: 'a year' },
		figures: [
			{ label: 'Child benefit for the year', amount: benefit },
			{ label: 'Kept after the charge', amount: kept },
			{ label: 'Share charged', amount: percent / 100, rate: true },
		],
		note,
		lines,
		caption: `Child benefit for ${children} ${children === 1 ? 'child' : 'children'} and the charge on ${money0(income)} of adjusted net income in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, 'england-ni', asAt),
		warnings,
		facts: { childBenefit: benefit, weeks, weekly, percent, charge, kept, calculatorEstimate: estimate },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(
			result,
			year,
			(taxYear, at) => childBenefitCharge({ ...input, taxYear, asAt: at, compare: false }),
			'charge',
			(next) => {
				const e2 = resolve(next.childBenefit.weeklyEldest, 'childBenefit.weeklyEldest', next.starts).value;
				const a2 = resolve(next.childBenefit.weeklyAdditional, 'childBenefit.weeklyAdditional', next.starts).value;
				const w2 = weeksStarting(weekDay.value, next.starts, next.ends);
				const parts: string[] = [];
				if (e2 !== eldest.value || a2 !== additional.value) parts.push(`the weekly rates are ${money(e2)} and ${money(a2)}, against ${money(eldest.value)} and ${money(additional.value)}`);
				if (w2 !== weeks) parts.push(`the year has ${w2} weeks of child benefit, against ${weeks}`);
				return parts.length ? `In ${next.label} ${parts.join(', and ')}.` : '';
			},
		);
	}
	return result;
}
