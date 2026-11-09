// Income tax for someone over State Pension age: the State Pension plus
// other income against the personal allowance and the bands, then the
// Pension Tax Allowance from 2027/28 where it applies.

import { getYear, nextYear, today, yearFor } from './config.ts';
import { pensionTaxAllowance } from './pensionTaxAllowance.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, allowanceLine, asAtWithin, compareWithNext, money, money0, nationBands, pct, sliceLines, taxOnTop, Used } from './simple.ts';
import { RulesUnavailableError, type LedgerLine, type Nation, type SimpleResult, type YearConfig } from './types.ts';

export interface StatePensionTaxInput {
	/** State Pension received in the year. */
	statePension: number;
	/** Private pensions, earnings and other taxable income. */
	otherIncome: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const STATE_PENSION_TOUCHES = /^(pensionTaxAllowance\.(rate|fullNewStatePension)|incomeTax\.(personalAllowance|taperStart|bands\.))/;

export function statePensionTax(input: StatePensionTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const statePension = Math.max(0, round2(input.statePension || 0));
	const other = Math.max(0, round2(input.otherIncome || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	const total = round2(statePension + other);
	const pa = allowanceFor(total, year, asAt, used);
	const paUsed = Math.min(pa.allowance, total);
	const taxable = floorPound(Math.max(0, total - pa.allowance));
	const bands = nationBands(year, input.nation, used);
	const tax = taxOnTop(taxable, 0, bands);

	// The Pension Tax Allowance, where the year has one and the date has reached it.
	let pta: ReturnType<typeof pensionTaxAllowance> | null = null;
	let ptaApplied = 0;
	const cfg = year.pensionTaxAllowance;
	if (cfg && asAt >= cfg.effectiveFrom) {
		try {
			pta = pensionTaxAllowance(total, year, asAt);
			used.prov(pta.provenance);
			ptaApplied = round2(Math.min(tax.total, pta.allowance));
		} catch (e) {
			if (e instanceof RulesUnavailableError) warnings.push(`The Pension Tax Allowance for ${year.label} cannot be applied: ${e.message}`);
			else throw e;
		}
	}
	const taxAfter = round2(tax.total - ptaApplied);

	lines.push({ id: 'state-pension', label: 'State Pension', kind: 'income', rate: null, slice: null, amount: statePension, sign: 1, provenance: null, arithmetic: `State Pension received in the year: ${money(statePension)}. It is paid without tax taken off, so any tax due is collected from other income or through an assessment.` });
	lines.push({ id: 'other', label: 'Other income', kind: 'income', rate: null, slice: null, amount: other, sign: 1, provenance: null, arithmetic: `Private pensions, earnings and other taxable income: ${money(other)}.` });
	lines.push(allowanceLine(pa, 'income', paUsed, total));
	lines.push(...sliceLines(tax.slices, 'tax', 'Income tax', 'Income'));
	if (cfg) {
		if (asAt < cfg.effectiveFrom) {
			lines.push({ id: 'pta', label: 'Pension Tax Allowance', kind: 'info', rate: null, slice: null, amount: 0, sign: 0, provenance: null, arithmetic: `The Pension Tax Allowance applies from ${cfg.effectiveFrom}, so it does not reduce this result.` });
		} else if (pta) {
			lines.push({
				id: 'pta',
				label: 'Pension Tax Allowance',
				kind: 'allowance',
				rate: null,
				slice: null,
				amount: ptaApplied,
				sign: 0,
				provenance: pta.provenance,
				arithmetic:
					pta.allowance === 0
						? `Total income of ${money(total)} is at or above ${money(pta.withdrawnAt)}, where the allowance is fully withdrawn, so it gives no reduction.`
						: total <= pta.fullNewStatePension
							? `Total income of ${money(total)} is no more than the full new State Pension of ${money(pta.fullNewStatePension)}, so the full allowance of ${money0(pta.maximum)} applies. It reduces the tax of ${money(tax.total)} by ${money(ptaApplied)}.`
							: `Total income is ${money(total - pta.fullNewStatePension)} above the full new State Pension of ${money(pta.fullNewStatePension)}. The maximum allowance of ${money0(pta.maximum)} falls by £1 for every £3 of that, to ${money(pta.allowance)}, which reduces the tax of ${money(tax.total)} by ${money(ptaApplied)}.`,
			});
		}
	} else {
		lines.push({ id: 'pta', label: 'Pension Tax Allowance', kind: 'info', rate: null, slice: null, amount: 0, sign: 0, provenance: null, arithmetic: `There is no Pension Tax Allowance in ${year.label}. It begins in April 2027.` });
	}
	lines.push({ id: 'tax', label: 'Income tax for the year', kind: 'total', rate: null, slice: taxable, amount: taxAfter, sign: -1, provenance: null, arithmetic: ptaApplied > 0 ? `${money(tax.total)} − ${money(ptaApplied)} = ${money(taxAfter)}.` : `${money(taxable)} of income is taxed; the total is ${money(taxAfter)}.` });

	const note =
		total === 0
			? 'Enter your State Pension and any other income.'
			: taxable === 0
				? `Total income of ${money(total)} is within the personal allowance, so no tax is due.`
				: ptaApplied > 0 && taxAfter === 0
					? `The Pension Tax Allowance removes all ${money(tax.total)} of tax on ${money(total)} of income.`
					: ptaApplied > 0
						? `The Pension Tax Allowance reduces the tax by ${money(ptaApplied)}.`
						: `${money(taxable)} of income is taxed at ${tax.slices.map((s) => pct(s.rate)).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}.`;

	const result: SimpleResult = {
		tool: 'state-pension-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Income tax for the year', amount: taxAfter, unit: 'a year' },
		figures: [
			{ label: 'Income after tax', amount: round2(total - taxAfter) },
			{ label: 'A month after tax', amount: round2((total - taxAfter) / 12) },
			{ label: 'Effective rate', amount: total > 0 ? round2((taxAfter / total) * 10000) / 10000 : 0, rate: true },
		],
		note,
		lines,
		caption: `Income tax on ${money0(total)} of income in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { totalIncome: total, taxableIncome: taxable, incomeTaxBefore: tax.total, pensionTaxAllowance: pta?.allowance ?? 0, incomeTaxAfter: taxAfter, withdrawnAt: pta?.withdrawnAt ?? 0 },
	};
	if (input.compare !== false) {
		result.comparison = compareWithNext(result, year, STATE_PENSION_TOUCHES, (taxYear, at) => statePensionTax({ ...input, taxYear, asAt: at, compare: false }));
		const next = nextYear(year.taxYear);
		if (result.comparison && result.comparison.amount !== null && !cfg && next?.pensionTaxAllowance) {
			result.comparison.sentence = `${result.comparison.sentence} The Pension Tax Allowance begins in ${next.label}.`;
		}
	}
	return result;
}
