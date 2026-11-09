// Tax on a side hustle: trading income less expenses or the trading
// allowance, income tax on the profit on top of other income at the
// nation's bands, and Class 4 National Insurance on the profit.

import { getYear, resolve, today, yearFor } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, allowanceLine, asAtWithin, compareWithNext, money, money0, nationBands, pct, sliceLines, taxOnTop, Used } from './simple.ts';
import type { LedgerLine, Nation, SimpleResult, YearConfig } from './types.ts';

export interface SideHustleTaxInput {
	/** Money received from the trade in the year, before expenses. */
	income: number;
	/** Costs of the trade: stock, materials, fees, mileage at the approved rate. */
	expenses: number;
	/** Taxable income from elsewhere: pay, pensions. */
	otherIncome: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const SIDE_HUSTLE_TOUCHES = /^(incomeTax\.(tradingAllowance|personalAllowance|taperStart|bands\.)|nationalInsurance\.selfEmployed\.class4\.)/;

export function sideHustleTax(input: SideHustleTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const income = Math.max(0, round2(input.income || 0));
	const expenses = Math.max(0, round2(input.expenses || 0));
	const other = Math.max(0, round2(input.otherIncome || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	const allowance = resolve(year.incomeTax.tradingAllowance, 'incomeTax.tradingAllowance', asAt);
	used.add(allowance);
	const route: 'allowance' | 'expenses' = expenses > allowance.value ? 'expenses' : 'allowance';
	const deducted = route === 'expenses' ? expenses : Math.min(income, allowance.value);
	const profit = round2(Math.max(0, income - deducted));
	if (route === 'expenses' && expenses > income) warnings.push(`Expenses exceed income by ${money(expenses - income)}. A trading loss can be set against other income or carried forward; this tool does not model that.`);

	const total = round2(other + profit);
	const pa = allowanceFor(total, year, asAt, used);
	const paOnOther = Math.min(pa.allowance, other);
	const paOnProfit = round2(Math.min(profit, pa.allowance - paOnOther));
	const otherTaxable = floorPound(Math.max(0, other - paOnOther));
	const taxableProfit = floorPound(Math.max(0, profit - paOnProfit));
	const bands = nationBands(year, input.nation, used);
	const tax = taxOnTop(taxableProfit, otherTaxable, bands);

	// Class 4 National Insurance on the profit alone.
	const c4 = year.nationalInsurance.selfEmployed.class4;
	const lpl = resolve(c4.lowerProfitsLimit, 'nationalInsurance.selfEmployed.class4.lowerProfitsLimit', asAt);
	const upl = resolve(c4.upperProfitsLimit, 'nationalInsurance.selfEmployed.class4.upperProfitsLimit', asAt);
	const mainRate = resolve(c4.mainRate, 'nationalInsurance.selfEmployed.class4.mainRate', asAt);
	const upperRate = resolve(c4.upperRate, 'nationalInsurance.selfEmployed.class4.upperRate', asAt);
	const profitPounds = floorPound(profit);
	const mainSlice = Math.max(0, Math.min(profitPounds, upl.value) - lpl.value);
	const upperSlice = Math.max(0, profitPounds - upl.value);
	const class4Main = round2(mainSlice * mainRate.value);
	const class4Upper = round2(upperSlice * upperRate.value);
	const class4 = round2(class4Main + class4Upper);
	used.add(lpl);
	if (mainSlice > 0) used.add(mainRate);
	if (upperSlice > 0) {
		used.add(upl);
		used.add(upperRate);
	}

	lines.push({ id: 'income', label: 'Trading income', kind: 'income', rate: null, slice: null, amount: income, sign: 1, provenance: null, arithmetic: `Money received from the trade in the year, before costs: ${money(income)}.` });
	if (route === 'expenses') {
		lines.push({ id: 'expenses', label: 'Expenses', kind: 'deduction', rate: null, slice: null, amount: expenses, sign: -1, provenance: allowance.provenance, arithmetic: `Expenses of ${money(expenses)} are more than the ${money0(allowance.value)} trading allowance, so they are deducted instead of it. The allowance and expenses cannot both be used.` });
	} else {
		lines.push({ id: 'trading-allowance', label: 'Trading allowance', kind: 'deduction', rate: null, slice: null, amount: deducted, sign: -1, provenance: allowance.provenance, arithmetic: expenses > 0 ? `The ${money0(allowance.value)} trading allowance is more than your ${money(expenses)} of expenses, so it is deducted instead of them.` : `The first ${money0(allowance.value)} of trading income is tax free. ${income <= allowance.value ? 'All of the income is covered and it does not need to be reported.' : ''}`.trim() });
	}
	lines.push({ id: 'profit', label: 'Taxable profit', kind: 'info', rate: null, slice: null, amount: profit, sign: 0, provenance: null, arithmetic: `${money(income)} − ${money(deducted)} = ${money(profit)}.` });
	lines.push({ id: 'other', label: 'Other income', kind: 'info', rate: null, slice: null, amount: other, sign: 0, provenance: null, arithmetic: `Pay, pensions and other taxable income: ${money(other)}. It is taxed first, so it sets where the profit sits in the bands.` });
	lines.push(allowanceLine(pa, 'profit', paOnProfit, total));
	lines.push(...sliceLines(tax.slices, 'tax', 'Income tax on profit', 'Profit'));
	lines.push({
		id: 'class4',
		label: 'Class 4 National Insurance',
		kind: 'deduction',
		rate: mainSlice > 0 ? mainRate.value : null,
		slice: mainSlice + upperSlice,
		amount: class4,
		sign: -1,
		provenance: mainSlice > 0 ? mainRate.provenance : lpl.provenance,
		arithmetic:
			mainSlice > 0
				? `Profit between the ${money0(lpl.value)} lower profits limit and the ${money0(upl.value)} upper profits limit: ${money(mainSlice)} × ${pct(mainRate.value)} = ${money(class4Main)}.${upperSlice > 0 ? ` Above the upper limit: ${money(upperSlice)} × ${pct(upperRate.value)} = ${money(class4Upper)}.` : ''} Class 2 is treated as paid on profits above the small profits threshold and is voluntary below it.`
				: `Profit of ${money(profit)} is at or below the ${money0(lpl.value)} lower profits limit, so no Class 4 is due. Class 4 is worked out on the profit alone, not on other income.`,
	});
	const totalDue = round2(tax.total + class4);
	lines.push({ id: 'total', label: 'Tax and National Insurance on your side hustle', kind: 'total', rate: null, slice: null, amount: totalDue, sign: -1, provenance: null, arithmetic: `${money(tax.total)} + ${money(class4)} = ${money(totalDue)}.` });

	const note =
		income === 0
			? 'Enter what the side hustle brought in.'
			: profit === 0
				? route === 'allowance'
					? `Income of ${money(income)} is within the ${money0(allowance.value)} trading allowance, so nothing is taxed and it does not need to be reported.`
					: 'Expenses are at least as large as the income, so there is no taxable profit.'
				: totalDue === 0
					? `The profit of ${money(profit)} is covered by the personal allowance.`
					: `${money(taxableProfit)} of profit is taxed at ${tax.slices.map((s) => pct(s.rate)).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}${class4 > 0 ? `, plus Class 4 National Insurance` : ''}.`;

	const result: SimpleResult = {
		tool: 'side-hustle-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Tax and National Insurance on your side hustle', amount: totalDue, unit: 'a year' },
		figures: [
			{ label: 'Kept after tax', amount: round2(income - (route === 'expenses' ? expenses : 0) - totalDue) },
			{ label: 'Income tax', amount: tax.total },
			{ label: 'Class 4 National Insurance', amount: class4 },
		],
		note,
		lines,
		caption: `How ${money0(income)} of trading income is taxed in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { profit, taxableProfit, incomeTax: tax.total, class4, total: totalDue, route, deducted },
	};
	if (input.compare !== false) {
		result.comparison = compareWithNext(result, year, SIDE_HUSTLE_TOUCHES, (taxYear, at) => sideHustleTax({ ...input, taxYear, asAt: at, compare: false }), 'tax and National Insurance');
	}
	return result;
}
