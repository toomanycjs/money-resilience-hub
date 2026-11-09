// Tax on savings interest: the personal allowance left after other income,
// the starting rate for savings, the personal savings allowance, then the
// savings rates band by band. Savings rates and allowances are UK-wide.

import { getYear, resolve, today, yearFor } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, allowanceLine, asAtWithin, bandsWithRates, compareWithNext, money, money0, pct, sliceLines, taxOnTop, Used } from './simple.ts';
import type { LedgerLine, Nation, SimpleResult, YearConfig } from './types.ts';

export interface SavingsTaxInput {
	/** Interest from savings in the year, before any tax. */
	interest: number;
	/** Taxable income other than savings interest and dividends: pay, pensions, profits. */
	otherIncome: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	/** Add the line comparing with the next tax year. Default true. */
	compare?: boolean;
}

export const SAVINGS_TOUCHES = /^incomeTax\.(savings\.|personalAllowance|taperStart|bands\.england-ni)/;

export function savingsTax(input: SavingsTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const interest = Math.max(0, round2(input.interest || 0));
	const other = Math.max(0, round2(input.otherIncome || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	// The personal allowance goes against other income first, then interest.
	const total = round2(other + interest);
	const pa = allowanceFor(total, year, asAt, used);
	const paOnOther = Math.min(pa.allowance, other);
	const paOnSavings = round2(Math.min(interest, pa.allowance - paOnOther));
	const nonSavingsTaxable = floorPound(Math.max(0, other - paOnOther));
	const savingsAfterPa = floorPound(Math.max(0, interest - paOnSavings));

	// Starting rate for savings: a 0% band that other income uses up first.
	const srl = resolve(year.incomeTax.savings.startingRateLimit, 'incomeTax.savings.startingRateLimit', asAt);
	used.add(srl);
	const startingRateLeft = Math.max(0, srl.value - nonSavingsTaxable);
	const srSlice = Math.min(savingsAfterPa, startingRateLeft);

	// Personal savings allowance: set by the band total income reaches.
	const limits = bandsWithRates(year, year.incomeTax.savings.rates, asAt, 'incomeTax.savings.rates', used);
	const taxableTotal = nonSavingsTaxable + savingsAfterPa;
	const band = taxableTotal <= (limits[0].upTo as number) ? 'basic' : taxableTotal <= (limits[1].upTo as number) ? 'higher' : 'additional';
	const psa = resolve(year.incomeTax.savings.personalSavingsAllowance[band], `incomeTax.savings.personalSavingsAllowance.${band}`, asAt);
	used.add(psa);
	const psaSlice = Math.min(savingsAfterPa - srSlice, psa.value);

	// What is left is taxed at the savings rates, stacked on top of everything so far.
	const taxed = savingsAfterPa - srSlice - psaSlice;
	const tax = taxOnTop(taxed, nonSavingsTaxable + srSlice + psaSlice, limits);

	lines.push({ id: 'interest', label: 'Savings interest', kind: 'income', rate: null, slice: null, amount: interest, sign: 1, provenance: null, arithmetic: `Interest received in the year, before tax: ${money(interest)}.` });
	lines.push({ id: 'other', label: 'Other income', kind: 'info', rate: null, slice: null, amount: other, sign: 0, provenance: null, arithmetic: `Pay, pensions and other taxable income apart from interest and dividends: ${money(other)}. It is taxed first, so it sets where the interest sits in the bands.` });
	lines.push(allowanceLine(pa, 'interest', paOnSavings, total));
	lines.push({
		id: 'starting-rate',
		label: 'Starting rate for savings',
		kind: 'band',
		rate: 0,
		slice: srSlice,
		amount: 0,
		sign: 0,
		provenance: srl.provenance,
		arithmetic:
			startingRateLeft > 0
				? `The ${money0(srl.value)} starting rate band is reduced by every pound of other income above the allowance (${money(nonSavingsTaxable)}), leaving ${money(startingRateLeft)}. ${money(srSlice)} of interest falls in it at 0%.`
				: `Other income above the allowance (${money(nonSavingsTaxable)}) uses up the whole ${money0(srl.value)} starting rate band, so none of the interest is taxed at 0% here.`,
	});
	lines.push({
		id: 'psa',
		label: `Personal savings allowance (${band} rate)`,
		kind: 'band',
		rate: 0,
		slice: psaSlice,
		amount: 0,
		sign: 0,
		provenance: psa.provenance,
		arithmetic:
			psa.value > 0
				? `Total taxable income of ${money(taxableTotal)} is in the ${band} rate band, so the allowance is ${money0(psa.value)}. ${money(psaSlice)} of interest falls in it at 0%.`
				: `Total taxable income of ${money(taxableTotal)} is in the ${band} rate band, which has no personal savings allowance.`,
	});
	lines.push(...sliceLines(tax.slices, 'savings', 'Tax on interest', 'Interest'));
	lines.push({ id: 'tax', label: 'Tax on your interest', kind: 'total', rate: null, slice: taxed, amount: tax.total, sign: -1, provenance: null, arithmetic: `${money(taxed)} of interest is taxed; the total is ${money(tax.total)}.` });

	if (input.nation === 'scotland' || input.nation === 'wales') {
		warnings.push(`Savings rates, the starting rate and the personal savings allowance are the same across the UK, so the result in ${input.nation === 'scotland' ? 'Scotland' : 'Wales'} matches the rest of the UK.`);
	}

	const kept = round2(interest - tax.total);
	const note =
		tax.total === 0
			? interest === 0
				? 'Enter the interest you expect to receive.'
				: `All ${money(interest)} of interest is covered by ${[paOnSavings > 0 ? 'the personal allowance' : '', srSlice > 0 ? 'the starting rate for savings' : '', psaSlice > 0 ? 'the personal savings allowance' : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
			: `${money(taxed)} of the interest is taxed, at ${tax.slices.map((s) => pct(s.rate)).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}.`;

	const result: SimpleResult = {
		tool: 'savings-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Tax on your savings interest', amount: tax.total, unit: 'a year' },
		figures: [
			{ label: 'Interest kept', amount: kept },
			{ label: 'Tax free', amount: round2(paOnSavings + srSlice + psaSlice) },
			{ label: 'Effective rate on interest', amount: interest > 0 ? round2((tax.total / interest) * 10000) / 10000 : 0, rate: true },
		],
		note,
		lines,
		caption: `How ${money0(interest)} of interest is taxed in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { tax: tax.total, taxableInterest: taxed, allowanceOnSavings: paOnSavings, startingRateUsed: srSlice, personalSavingsAllowance: psa.value, personalSavingsAllowanceUsed: psaSlice, band },
	};
	if (input.compare !== false) {
		result.comparison = compareWithNext(result, year, SAVINGS_TOUCHES, (taxYear, at) => savingsTax({ ...input, taxYear, asAt: at, compare: false }));
	}
	return result;
}
