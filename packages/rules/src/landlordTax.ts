// Tax on rental profit: income less expenses or the property allowance,
// then the property rates band by band on top of other income, less the
// tax reduction for residential finance costs. In Scotland property income
// is taxed at the Scottish rates until Scotland sets its own property
// rates, which the config records as not set for 2027/28.
//
// Finance costs (mortgage interest) are not deducted from rent. The
// reduction is the relief rate times the lowest of the finance costs, the
// property profit and adjusted total income above the personal allowance,
// and it cannot take the tax bill below nothing. It cannot be claimed
// together with the property allowance, so with finance costs entered the
// tool works out both routes and shows the one with less tax.

import { getYear, resolve, today, yearFor } from './config.ts';
import { makingTaxDigitalCheck, withInformationSources } from './makingTaxDigital.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, allowanceLine, asAtWithin, bandsWithRates, compareWithNext, money, money0, nationBands, pct, sliceLines, taxOnTop, type AllowanceOutcome, type RateBand, Used } from './simple.ts';
import { RulesUnavailableError, type BandResult, type LedgerLine, type Nation, type Provenance, type SimpleResult, type YearConfig } from './types.ts';

export interface LandlordTaxInput {
	/** Rent received in the year. */
	rent: number;
	/** Allowable expenses: agent fees, repairs, insurance, ground rent. Not mortgage interest. */
	expenses: number;
	/** Mortgage interest and other finance costs on residential lettings. Relieved as a tax reduction, not deducted. */
	financeCosts?: number;
	/** Taxable income other than rent: pay, pensions, profits. Not savings interest or dividends. */
	otherIncome: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const LANDLORD_TOUCHES = /^incomeTax\.(property\.|propertyAllowance|personalAllowance|taperStart|bands\.)/;

interface ReliefRate {
	rate: number;
	/** "the basic rate of 20%" or "the property basic rate of 24%". */
	phrase: string;
	/** Shown on the ledger line. */
	provenance: Provenance;
	/** Everything the rate rests on, for the rules used. */
	all: Provenance[];
	/** True when no source states the rate as a figure and it is taken from the property basic rate. */
	derived: boolean;
}

/**
 * The rate of the finance cost reduction. Where the config records that relief
 * is given at the property basic rate, that rate is read; otherwise the rate
 * recorded as a figure is used.
 */
export function financeCostReliefRate(year: YearConfig, asAt: string): ReliefRate {
	const p = year.incomeTax.property;
	const basisLeaf = p.financeCostReliefBasis;
	if (basisLeaf && basisLeaf.value === 'property basic rate') {
		const basis = resolve(basisLeaf, 'incomeTax.property.financeCostReliefBasis', asAt);
		const r = resolve(p.rates.basic, 'incomeTax.property.rates.basic', asAt);
		const stated = p.financeCostReliefRate && p.financeCostReliefRate.value !== null;
		return { rate: r.value, phrase: `the property basic rate of ${pct(r.value)}`, provenance: basis.provenance, all: [basis.provenance, r.provenance], derived: !stated };
	}
	if (!p.financeCostReliefRate) throw new RulesUnavailableError(`The rate of finance cost relief for ${year.label} has not been recorded`, 'incomeTax.property.financeCostReliefRate');
	const r = resolve(p.financeCostReliefRate, 'incomeTax.property.financeCostReliefRate', asAt);
	return { rate: r.value, phrase: `the basic rate of ${pct(r.value)}`, provenance: r.provenance, all: [r.provenance], derived: false };
}

interface Route {
	route: 'allowance' | 'expenses';
	deducted: number;
	profit: number;
	total: number;
	pa: AllowanceOutcome;
	paOnProfit: number;
	taxableProfit: number;
	/** Other income and profit above the personal allowance: the third limit on the reduction. */
	incomeAboveAllowance: number;
	tax: { total: number; slices: BandResult[] };
	/** Tax on the other income, which with the tax on the profit is the most the reduction can be. */
	otherTax: number;
	/** The lowest of finance costs, profit and income above the allowance. */
	lowest: number;
	reliefBeforeCap: number;
	relief: number;
	/** Finance costs that earned no reduction this year. */
	unused: number;
	/** Tax on the profit after the reduction. */
	net: number;
	labelPrefix: string;
	used: Used;
}

export function landlordTax(input: LandlordTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const rent = Math.max(0, round2(input.rent || 0));
	const expenses = Math.max(0, round2(input.expenses || 0));
	const financeCosts = Math.max(0, round2(input.financeCosts || 0));
	const other = Math.max(0, round2(input.otherIncome || 0));
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	if (!year.incomeTax.propertyAllowance) throw new RulesUnavailableError(`The property allowance for ${year.label} has not been recorded`, 'incomeTax.propertyAllowance');
	const allowance = resolve(year.incomeTax.propertyAllowance, 'incomeTax.propertyAllowance', asAt);

	// The relief rate is needed for the figure only when finance costs are entered; without them the line still names it if it is recorded.
	let relief: ReliefRate | null = null;
	try {
		relief = financeCostReliefRate(year, asAt);
	} catch (e) {
		if (!(e instanceof RulesUnavailableError) || financeCosts > 0) throw e;
	}

	const compute = (route: 'allowance' | 'expenses'): Route => {
		const used = new Used();
		used.add(allowance);
		const deducted = route === 'expenses' ? expenses : Math.min(rent, allowance.value);
		const profit = round2(Math.max(0, rent - deducted));
		const total = round2(other + profit);
		const pa = allowanceFor(total, year, asAt, used);
		const paOnOther = Math.min(pa.allowance, other);
		const paOnProfit = round2(Math.min(profit, pa.allowance - paOnOther));
		const otherTaxable = floorPound(Math.max(0, other - paOnOther));
		const taxableProfit = floorPound(Math.max(0, profit - paOnProfit));

		let bands: RateBand[];
		let otherBands: RateBand[];
		let labelPrefix: string;
		if (input.nation === 'scotland') {
			if (year.incomeTax.property.scotlandRates) {
				const s = resolve(year.incomeTax.property.scotlandRates, 'incomeTax.property.scotlandRates', asAt);
				used.add(s);
			}
			bands = nationBands(year, 'scotland', used);
			otherBands = bands;
			labelPrefix = 'Scottish income tax on profit';
		} else {
			bands = bandsWithRates(year, year.incomeTax.property.rates, asAt, 'incomeTax.property.rates', used);
			// Pay and pensions are taxed at the rates for where the landlord lives, which is also where those rates are sourced.
			otherBands = nationBands(year, input.nation, used);
			labelPrefix = 'Tax on profit';
		}
		const tax = taxOnTop(taxableProfit, otherTaxable, bands);
		const otherTax = taxOnTop(otherTaxable, 0, otherBands).total;

		// The reduction is not available with the property allowance.
		const costs = route === 'expenses' ? financeCosts : 0;
		const incomeAboveAllowance = otherTaxable + taxableProfit;
		const lowest = Math.min(costs, profit, incomeAboveAllowance);
		const reliefBeforeCap = relief ? round2(lowest * relief.rate) : 0;
		const reliefGiven = Math.min(reliefBeforeCap, round2(otherTax + tax.total));
		if (relief && costs > 0) for (const p of relief.all) used.prov(p);
		return {
			route,
			deducted,
			profit,
			total,
			pa,
			paOnProfit,
			taxableProfit,
			incomeAboveAllowance,
			tax,
			otherTax,
			lowest,
			reliefBeforeCap,
			relief: reliefGiven,
			unused: round2(costs - lowest),
			net: round2(Math.max(0, tax.total - reliefGiven)),
			labelPrefix,
			used,
		};
	};

	// Expenses or the allowance, never both. Without finance costs the larger deduction is shown, as before.
	// With them the routes can differ in more than the deduction, so the one with less tax is shown.
	const withExpenses = compute('expenses');
	const withAllowance = compute('allowance');
	const largerDeduction = expenses > allowance.value ? withExpenses : withAllowance;
	const r = financeCosts > 0 && withExpenses.net !== withAllowance.net ? (withExpenses.net < withAllowance.net ? withExpenses : withAllowance) : largerDeduction;
	const alternative = r === withExpenses ? withAllowance : withExpenses;
	const { route, deducted, profit, tax, taxableProfit, used } = r;
	const comparedOnTax = financeCosts > 0 && withExpenses.net !== withAllowance.net;

	if (route === 'expenses' && expenses > rent) warnings.push(`Expenses exceed rent by ${money(expenses - rent)}. A property loss can be carried forward against later property profits; this tool does not carry it.`);
	if (route === 'expenses' && r.unused > 0) warnings.push(`${money(r.unused)} of finance costs earns no reduction this year. Unused finance costs are carried forward to later years; this tool does not carry them.`);
	if (r.relief > tax.total) warnings.push(`The reduction of ${money(r.relief)} is more than the ${money(tax.total)} of tax on the profit. The other ${money(r.relief - tax.total)} comes off the tax on your other income.`);

	lines.push({ id: 'rent', label: 'Rent received', kind: 'income', rate: null, slice: null, amount: rent, sign: 1, provenance: null, arithmetic: `Rent from all your lettings in the year: ${money(rent)}.` });
	if (route === 'expenses') {
		lines.push({
			id: 'expenses',
			label: 'Allowable expenses',
			kind: 'deduction',
			rate: null,
			slice: null,
			amount: expenses,
			sign: -1,
			provenance: allowance.provenance,
			arithmetic: comparedOnTax
				? `Deducting ${money(expenses)} of expenses and taking the reduction for finance costs gives ${money(r.net)} of tax. The ${money0(allowance.value)} property allowance, which cannot be used with that reduction, would give ${money(alternative.net)}. The route with less tax is shown.`
				: `Expenses of ${money(expenses)} are more than the ${money0(allowance.value)} property allowance, so they are deducted instead of it. Mortgage interest is not deducted here; it has its own line below.`,
		});
	} else {
		lines.push({
			id: 'property-allowance',
			label: 'Property allowance',
			kind: 'deduction',
			rate: null,
			slice: null,
			amount: deducted,
			sign: -1,
			provenance: allowance.provenance,
			arithmetic: comparedOnTax
				? `The ${money0(allowance.value)} property allowance gives ${money(r.net)} of tax. Deducting ${money(expenses)} of expenses and taking the reduction for finance costs, which cannot be used with the allowance, would give ${money(alternative.net)}. The route with less tax is shown.`
				: expenses > 0
					? `The ${money0(allowance.value)} property allowance is more than your ${money(expenses)} of expenses, so it is deducted instead of them.`
					: `The first ${money0(allowance.value)} of property income is tax free. ${rent <= allowance.value ? 'All of the rent is covered.' : ''}`.trim(),
		});
	}
	lines.push({ id: 'profit', label: 'Rental profit', kind: 'info', rate: null, slice: null, amount: profit, sign: 0, provenance: null, arithmetic: `${money(rent)} − ${money(deducted)} = ${money(profit)}.` });
	lines.push({ id: 'other', label: 'Other income', kind: 'info', rate: null, slice: null, amount: other, sign: 0, provenance: null, arithmetic: `Pay, pensions and other taxable income: ${money(other)}. It is taxed first, so it sets where the profit sits in the bands.` });
	lines.push(allowanceLine(r.pa, 'rental profit', r.paOnProfit, r.total));
	lines.push(...sliceLines(tax.slices, 'property', r.labelPrefix, 'Profit'));

	const explain = relief
		? `Mortgage interest and other finance costs on a residential let are not deducted from rent. Instead the tax is reduced by ${relief.phrase} of the lowest of three amounts: the finance costs, the rental profit, and income above the personal allowance.`
		: 'Mortgage interest and other finance costs on a residential let are not deducted from rent. They reduce the tax instead.';
	const derivedNote = relief?.derived ? ` No gov.uk page states the rate for ${year.label} as a figure; the technical note on the property rates says relief is given at the property basic rate, so that rate is used.` : '';
	let reliefArithmetic: string;
	if (financeCosts === 0) {
		reliefArithmetic = `No finance costs entered. ${explain}${derivedNote}`;
	} else if (route === 'allowance') {
		reliefArithmetic = `${explain} The reduction cannot be used together with the property allowance, which is the route shown here because it gives ${comparedOnTax ? 'less tax' : 'the same tax'}.`;
	} else {
		reliefArithmetic =
			`${explain} Finance costs ${money(financeCosts)}, rental profit ${money(profit)}, income above the allowance ${money(r.incomeAboveAllowance)}: the lowest is ${money(r.lowest)}. ${money(r.lowest)} × ${pct(relief!.rate)} = ${money(r.reliefBeforeCap)}.` +
			(r.relief < r.reliefBeforeCap ? ` The reduction cannot create a refund, so it stops at the ${money(r.relief)} of tax due.` : ' The reduction cannot create a refund.') +
			derivedNote;
	}
	if (financeCosts > 0 && route === 'expenses') {
		lines.push({ id: 'tax-before-relief', label: 'Tax on profit before finance cost relief', kind: 'info', rate: null, slice: taxableProfit, amount: tax.total, sign: 0, provenance: null, arithmetic: `${money(taxableProfit)} of profit is taxed; the bands above add up to ${money(tax.total)}.` });
	}
	lines.push({
		id: 'finance-cost-relief',
		label: 'Finance cost relief (mortgage interest)',
		kind: 'allowance',
		rate: relief && r.relief > 0 ? relief.rate : null,
		slice: r.relief > 0 ? r.lowest : null,
		amount: r.relief,
		sign: 1,
		provenance: relief?.provenance ?? null,
		arithmetic: reliefArithmetic,
	});
	lines.push({
		id: 'tax',
		label: 'Tax on your rental profit',
		kind: 'total',
		rate: null,
		slice: taxableProfit,
		amount: r.net,
		sign: -1,
		provenance: null,
		arithmetic: r.relief > 0 ? `${money(tax.total)} of tax on ${money(taxableProfit)} of taxable profit, less ${money(Math.min(r.relief, tax.total))} of finance cost relief, is ${money(r.net)}.` : `${money(taxableProfit)} of profit is taxed; the total is ${money(tax.total)}.`,
	});

	const mtd = makingTaxDigitalCheck(year, rent, 'rent');
	if (mtd) lines.push(mtd.line);

	const rates = tax.slices
		.map((s) => pct(s.rate))
		.filter((v, i, a) => a.indexOf(v) === i)
		.join(' and ');
	const interestNote =
		r.relief > 0
			? ` Mortgage interest is not deducted from rent; it takes ${money(r.relief)} off the tax as finance cost relief.`
			: financeCosts > 0 && route === 'allowance'
				? ' The property allowance is used, so no finance cost relief is given.'
				: financeCosts === 0
					? ' Mortgage interest is not deducted from rent; it reduces the tax instead, on its own line in the working.'
					: '';
	const note =
		profit === 0
			? rent === 0
				? 'Enter the rent you receive.'
				: route === 'allowance'
					? `Rent of ${money(rent)} is within the ${money0(allowance.value)} property allowance, so there is no taxable profit.`
					: `Expenses are at least as large as the rent, so there is no taxable profit.`
			: tax.total === 0
				? `The profit of ${money(profit)} is covered by the personal allowance.`
				: `${money(taxableProfit)} of profit is taxed at ${rates}.${interestNote}`;

	const facts: Record<string, number | string> = {
		profit,
		taxableProfit,
		tax: r.net,
		taxBeforeRelief: tax.total,
		financeCostRelief: r.relief,
		financeCostsUnused: route === 'expenses' ? r.unused : 0,
		route,
		deducted,
	};
	if (mtd) {
		facts.makingTaxDigital = mtd.position;
		if (mtd.threshold !== null) facts.makingTaxDigitalThreshold = mtd.threshold;
		if (mtd.startDate !== null) facts.makingTaxDigitalStart = mtd.startDate;
	}

	const rulesUsed = used.rulesUsed(year, input.nation, asAt);
	const result: SimpleResult = {
		tool: 'landlord-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Tax on your rental profit', amount: r.net, unit: 'a year' },
		figures: [
			{ label: financeCosts > 0 ? 'Left after tax and finance costs' : 'Profit after tax', amount: round2(profit - r.net - financeCosts) },
			{ label: 'Rental profit', amount: profit },
			...(financeCosts > 0 ? [{ label: 'Finance cost relief', amount: r.relief }] : []),
			{ label: 'Effective rate on profit', amount: profit > 0 ? round2((r.net / profit) * 10000) / 10000 : 0, rate: true },
		],
		note,
		lines,
		caption: `How ${money0(rent)} of rent is taxed in ${year.label}`,
		comparison: null,
		rulesUsed: mtd ? withInformationSources(rulesUsed, mtd.provenance) : rulesUsed,
		warnings,
		facts,
	};
	if (input.compare !== false) {
		result.comparison = compareWithNext(result, year, LANDLORD_TOUCHES, (taxYear, at) => landlordTax({ ...input, taxYear, asAt: at, compare: false }));
	}
	return result;
}
