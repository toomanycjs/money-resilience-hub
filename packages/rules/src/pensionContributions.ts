// The same pension contribution paid three ways: relief at source, net pay
// and salary sacrifice. For each, what it takes from take-home pay, the
// income tax saved and the National Insurance saved.

import { getYear, nextYear, today, yearFor } from './config.ts';
import { round2 } from './rounding.ts';
import { deductionSources, plansOf, useBreakdown, type PlanChoice } from './payShared.ts';
import { asAtWithin, money, money0, Used } from './simple.ts';
import { takeHome } from './takeHome.ts';
import { PENSION_LABEL, RulesUnavailableError, type LedgerLine, type Nation, type PensionType, type SimpleResult, type YearConfig } from './types.ts';

export interface PensionContributionsInput {
	/** Salary a year, before tax. */
	salary: number;
	/** Contribution as a percentage of salary, e.g. 5 for 5%. */
	percent: number;
	nation: Nation;
	plan?: PlanChoice;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

const TYPES: PensionType[] = ['relief-at-source', 'net-pay', 'salary-sacrifice'];
const KEY: Record<PensionType, string> = { 'relief-at-source': 'Ras', 'net-pay': 'NetPay', 'salary-sacrifice': 'Sacrifice' };

export function pensionContributions(input: PensionContributionsInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const salary = Math.max(0, round2(input.salary || 0));
	const percent = Math.min(100, Math.max(0, input.percent || 0));
	const plans = plansOf(input.plan);
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	const base = { gross: salary, nation: input.nation, studentLoanPlans: plans, taxYear: year.taxYear, asAt };
	const none = takeHome(base, { withMarginal: false });
	useBreakdown(used, none);
	const src = deductionSources(none, year);
	for (const w of none.warnings) warnings.push(w);
	const contribution = round2(salary * (percent / 100));

	lines.push({ id: 'salary', label: 'Salary', kind: 'info', rate: null, slice: null, amount: salary, sign: 0, provenance: null, arithmetic: `With no pension contribution, take-home pay on ${money(salary)} is ${money(none.takeHome)} a year.` });
	lines.push({ id: 'contribution', label: 'Going into the pension', kind: 'info', rate: percent / 100, slice: salary, amount: contribution, sign: 0, provenance: null, arithmetic: `${money(salary)} × ${+percent.toFixed(2)}% = ${money(contribution)} a year under each arrangement, before anything an employer adds.` });

	const facts: Record<string, number | string> = { contribution, takeHomeWithout: none.takeHome };
	const costs: Record<PensionType, number> = { 'relief-at-source': 0, 'net-pay': 0, 'salary-sacrifice': 0 };
	for (const type of TYPES) {
		const b = takeHome({ ...base, pension: { type, percent } }, { withMarginal: false });
		useBreakdown(used, b);
		const label = PENSION_LABEL[type];
		const cost = round2(none.takeHome - b.takeHome);
		const taxSaved = b.pension?.taxSaving ?? 0;
		const niSaved = b.pension?.niSaving ?? 0;
		const loanSaved = round2(none.studentLoans.total - b.studentLoans.total);
		const fromPay = b.pension?.fromPay ?? 0;
		const providerAdds = b.pension?.providerAdds ?? 0;
		costs[type] = cost;
		facts[`cost${KEY[type]}`] = cost;
		facts[`taxSaved${KEY[type]}`] = taxSaved;
		facts[`niSaved${KEY[type]}`] = niSaved;
		facts[`loanSaved${KEY[type]}`] = loanSaved;

		const taxHow =
			type === 'relief-at-source'
				? `You pay ${money(fromPay)} from pay after tax and the provider claims ${money(providerAdds)} of basic rate relief. ${round2(taxSaved - providerAdds) > 0 ? `The basic rate band is also widened by the contribution, which takes ${money(round2(taxSaved - providerAdds))} off the income tax bill. ` : ''}Tax saved in total: ${money(taxSaved)}.`
				: type === 'net-pay'
					? `The contribution comes out of pay before income tax, so tax is worked out on ${money(round2(salary - contribution))}. Income tax falls from ${money(none.incomeTax.total)} to ${money(b.incomeTax.total)}, saving ${money(taxSaved)}.`
					: `Salary is reduced to ${money(round2(salary - contribution))} and the employer pays the ${money(contribution)} in. Income tax falls from ${money(none.incomeTax.total)} to ${money(b.incomeTax.total)}, saving ${money(taxSaved)}.`;
		lines.push({ id: `${type}-tax`, label: `${label}: income tax saved`, kind: 'info', rate: contribution > 0 ? round2((taxSaved / contribution) * 10000) / 10000 : null, slice: contribution, amount: taxSaved, sign: 0, provenance: src.tax, arithmetic: taxHow });
		lines.push({
			id: `${type}-ni`,
			label: `${label}: National Insurance saved`,
			kind: 'info',
			rate: contribution > 0 ? round2((niSaved / contribution) * 10000) / 10000 : null,
			slice: contribution,
			amount: niSaved,
			sign: 0,
			provenance: src.ni,
			arithmetic:
				type === 'salary-sacrifice'
					? `National Insurance is worked out on the reduced salary: it falls from ${money(none.nationalInsurance.total)} to ${money(b.nationalInsurance.total)}, saving ${money(niSaved)}.${loanSaved > 0 ? ` Student loan repayments fall by ${money(loanSaved)} for the same reason.` : ''}`
					: `National Insurance is still worked out on the full ${money(salary)}, so nothing is saved.`,
		});
		lines.push({
			id: `${type}-cost`,
			label: `${label}: take-home pay falls by`,
			kind: 'pension',
			rate: contribution > 0 ? round2((cost / contribution) * 10000) / 10000 : null,
			slice: contribution,
			amount: cost,
			sign: -1,
			provenance: null,
			arithmetic: `Take-home pay of ${money(none.takeHome)} becomes ${money(b.takeHome)}: ${money(cost)} less a year, ${money(round2(cost / 12))} a month, for ${money(contribution)} in the pension.`,
		});
	}

	const cheapest = TYPES.reduce((a, t) => (costs[t] < costs[a] ? t : a), TYPES[0]);
	const dearest = TYPES.reduce((a, t) => (costs[t] > costs[a] ? t : a), TYPES[0]);
	const note =
		contribution === 0
			? 'Enter a salary and a contribution percentage.'
			: costs[dearest] - costs[cheapest] < 0.005
				? `All three arrangements cost the same ${money(costs[cheapest])} of take-home pay for ${money(contribution)} in the pension.`
				: `${money(contribution)} in the pension costs between ${money(costs[cheapest])} (${PENSION_LABEL[cheapest].toLowerCase()}) and ${money(costs[dearest])} (${PENSION_LABEL[dearest].toLowerCase()}) of take-home pay. Which arrangement applies is set by the pension scheme and the employer.`;

	const result: SimpleResult = {
		tool: 'pension-contributions',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Going into your pension', amount: contribution, unit: 'a year' },
		figures: TYPES.map((t) => ({ label: `Cost with ${PENSION_LABEL[t].toLowerCase()}`, amount: costs[t] })),
		note,
		lines,
		caption: `What a ${+percent.toFixed(2)}% pension contribution on ${money0(salary)} costs in take-home pay in ${year.label}, by arrangement`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts,
	};

	if (input.compare !== false) {
		const next = nextYear(year.taxYear);
		if (next) {
			try {
				const then = pensionContributions({ ...input, taxYear: next.taxYear, asAt: next.starts, compare: false });
				const same = TYPES.every((t) => Math.abs((then.facts[`cost${KEY[t]}`] as number) - costs[t]) < 0.005);
				result.comparison = {
					taxYear: next.taxYear,
					label: next.label,
					amount: then.headline.amount,
					difference: 0,
					sentence: same
						? `Under ${next.label} as announced so far, the same contribution costs the same under each arrangement.`
						: `Under ${next.label} as announced so far, the same contribution costs ${TYPES.map((t) => `${money(then.facts[`cost${KEY[t]}`] as number)} with ${PENSION_LABEL[t].toLowerCase()}`).join(', ')}.`,
				};
			} catch (e) {
				if (e instanceof RulesUnavailableError) result.comparison = { taxYear: next.taxYear, label: next.label, amount: null, difference: null, sentence: `Under ${next.label} this result cannot be shown yet: ${e.message.replace(/^[\w.[\]-]+: /, '').replace(/\.$/, '')}.` };
				else throw e;
			}
		}
	}
	return result;
}
