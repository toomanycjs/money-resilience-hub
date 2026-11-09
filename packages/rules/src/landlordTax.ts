// Tax on rental profit: income less expenses or the property allowance,
// then the property rates band by band on top of other income. In Scotland
// property income is taxed at the Scottish rates until Scotland sets its
// own property rates, which the config records as not set for 2027/28.

import { getYear, resolve, today, yearFor } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, allowanceLine, asAtWithin, bandsWithRates, compareWithNext, money, money0, nationBands, pct, sliceLines, taxOnTop, type RateBand, Used } from './simple.ts';
import { RulesUnavailableError, type LedgerLine, type Nation, type SimpleResult, type YearConfig } from './types.ts';

export interface LandlordTaxInput {
	/** Rent received in the year. */
	rent: number;
	/** Allowable expenses: agent fees, repairs, insurance, ground rent. Not mortgage interest. */
	expenses: number;
	/** Taxable income other than rent: pay, pensions, profits. */
	otherIncome: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const LANDLORD_TOUCHES = /^incomeTax\.(property\.|propertyAllowance|personalAllowance|taperStart|bands\.)/;

export function landlordTax(input: LandlordTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const rent = Math.max(0, round2(input.rent || 0));
	const expenses = Math.max(0, round2(input.expenses || 0));
	const other = Math.max(0, round2(input.otherIncome || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	if (!year.incomeTax.propertyAllowance) throw new RulesUnavailableError(`The property allowance for ${year.label} has not been recorded`, 'incomeTax.propertyAllowance');
	const allowance = resolve(year.incomeTax.propertyAllowance, 'incomeTax.propertyAllowance', asAt);
	used.add(allowance);

	// Expenses or the allowance, never both. The route that leaves less profit is shown.
	const route: 'allowance' | 'expenses' = expenses > allowance.value ? 'expenses' : 'allowance';
	const deducted = route === 'expenses' ? expenses : Math.min(rent, allowance.value);
	const profit = round2(Math.max(0, rent - deducted));
	if (route === 'expenses' && expenses > rent) warnings.push(`Expenses exceed rent by ${money(expenses - rent)}. A property loss can be carried forward against later property profits; this tool does not carry it.`);

	const total = round2(other + profit);
	const pa = allowanceFor(total, year, asAt, used);
	const paOnOther = Math.min(pa.allowance, other);
	const paOnProfit = round2(Math.min(profit, pa.allowance - paOnOther));
	const otherTaxable = floorPound(Math.max(0, other - paOnOther));
	const taxableProfit = floorPound(Math.max(0, profit - paOnProfit));

	let bands: RateBand[];
	let labelPrefix: string;
	if (input.nation === 'scotland') {
		if (year.incomeTax.property.scotlandRates) {
			const s = resolve(year.incomeTax.property.scotlandRates, 'incomeTax.property.scotlandRates', asAt);
			used.add(s);
		}
		bands = nationBands(year, 'scotland', used);
		labelPrefix = 'Scottish income tax on profit';
	} else {
		bands = bandsWithRates(year, year.incomeTax.property.rates, asAt, 'incomeTax.property.rates', used);
		labelPrefix = 'Tax on profit';
	}
	const tax = taxOnTop(taxableProfit, otherTaxable, bands);

	lines.push({ id: 'rent', label: 'Rent received', kind: 'income', rate: null, slice: null, amount: rent, sign: 1, provenance: null, arithmetic: `Rent from all your lettings in the year: ${money(rent)}.` });
	if (route === 'expenses') {
		lines.push({ id: 'expenses', label: 'Allowable expenses', kind: 'deduction', rate: null, slice: null, amount: expenses, sign: -1, provenance: allowance.provenance, arithmetic: `Expenses of ${money(expenses)} are more than the ${money0(allowance.value)} property allowance, so they are deducted instead of it. Mortgage interest is not an allowable expense for an individual landlord.` });
	} else {
		lines.push({ id: 'property-allowance', label: 'Property allowance', kind: 'deduction', rate: null, slice: null, amount: deducted, sign: -1, provenance: allowance.provenance, arithmetic: expenses > 0 ? `The ${money0(allowance.value)} property allowance is more than your ${money(expenses)} of expenses, so it is deducted instead of them.` : `The first ${money0(allowance.value)} of property income is tax free. ${rent <= allowance.value ? 'All of the rent is covered.' : ''}`.trim() });
	}
	lines.push({ id: 'profit', label: 'Rental profit', kind: 'info', rate: null, slice: null, amount: profit, sign: 0, provenance: null, arithmetic: `${money(rent)} − ${money(deducted)} = ${money(profit)}.` });
	lines.push({ id: 'other', label: 'Other income', kind: 'info', rate: null, slice: null, amount: other, sign: 0, provenance: null, arithmetic: `Pay, pensions and other taxable income: ${money(other)}. It is taxed first, so it sets where the profit sits in the bands.` });
	lines.push(allowanceLine(pa, 'rental profit', paOnProfit, total));
	lines.push(...sliceLines(tax.slices, 'property', labelPrefix, 'Profit'));
	lines.push({ id: 'tax', label: 'Tax on your rental profit', kind: 'total', rate: null, slice: taxableProfit, amount: tax.total, sign: -1, provenance: null, arithmetic: `${money(taxableProfit)} of profit is taxed; the total is ${money(tax.total)}.` });

	const note =
		profit === 0
			? rent === 0
				? 'Enter the rent you receive.'
				: route === 'allowance'
					? `Rent of ${money(rent)} is within the ${money0(allowance.value)} property allowance, so there is no taxable profit.`
					: `Expenses are at least as large as the rent, so there is no taxable profit.`
			: tax.total === 0
				? `The profit of ${money(profit)} is covered by the personal allowance.`
				: `${money(taxableProfit)} of profit is taxed at ${tax.slices.map((s) => pct(s.rate)).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}.`;

	const result: SimpleResult = {
		tool: 'landlord-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Tax on your rental profit', amount: tax.total, unit: 'a year' },
		figures: [
			{ label: 'Profit after tax', amount: round2(profit - tax.total) },
			{ label: 'Rental profit', amount: profit },
			{ label: 'Effective rate on profit', amount: profit > 0 ? round2((tax.total / profit) * 10000) / 10000 : 0, rate: true },
		],
		note,
		lines,
		caption: `How ${money0(rent)} of rent is taxed in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { profit, taxableProfit, tax: tax.total, route, deducted },
	};
	if (input.compare !== false) {
		result.comparison = compareWithNext(result, year, LANDLORD_TOUCHES, (taxYear, at) => landlordTax({ ...input, taxYear, asAt: at, compare: false }));
	}
	return result;
}
