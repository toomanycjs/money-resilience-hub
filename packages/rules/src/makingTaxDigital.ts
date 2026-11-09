// Making Tax Digital for Income Tax: whether the rent or trading income
// entered is over the qualifying income threshold. Qualifying income is
// self-employment and property income added together before expenses. The
// test on a tax year's income decides who must use Making Tax Digital from
// the 6 April two tax years later, so the line names both the year tested
// and the date it bites. It is information, not part of the tax figure.

import { provenanceOf } from './config.ts';
import { longDate, money, money0 } from './simple.ts';
import type { Leaf, LedgerLine, Provenance, RulesUsed, YearConfig } from './types.ts';

export type MtdPosition = 'above' | 'not-above' | 'not-set';

export interface MtdCheck {
	position: MtdPosition;
	/** The threshold this tax year's qualifying income is tested against, if set. */
	threshold: number | null;
	/** The date Making Tax Digital applies from when the income is over the threshold, if set. */
	startDate: string | null;
	line: LedgerLine;
	provenance: Provenance[];
}

const slashYear = (taxYear: string) => taxYear.replace('-', '/');
const has = <T>(leaf: Leaf<T> | undefined): leaf is Leaf<T> & { value: T } => !!leaf && leaf.value !== null && leaf.value !== undefined;

/**
 * The Making Tax Digital line for a result. `entered` names the income the
 * tool asked for; the other kind of qualifying income is not in the tool, and
 * the line says so. Returns null when the year records nothing about it.
 */
export function makingTaxDigitalCheck(year: YearConfig, qualifyingIncome: number, entered: 'rent' | 'trading income'): MtdCheck | null {
	const mtd = year.makingTaxDigital;
	if (!mtd) return null;
	const income = Math.max(0, qualifyingIncome);
	const other = entered === 'rent' ? 'self-employment income' : 'rent from property';
	const provenance: Provenance[] = [];
	const basis = `Qualifying income is self-employment income and rent added together, before expenses. This tool has only your ${entered} of ${money(income)}; any ${other} counts as well, and so does a share of jointly owned property.`;

	let inUse = '';
	if (mtd.inUse && has(mtd.inUse.threshold) && has(mtd.inUse.incomeYear)) {
		provenance.push(provenanceOf(mtd.inUse.threshold));
		inUse = ` During ${year.label} itself it applies where qualifying income for ${slashYear(mtd.inUse.incomeYear.value)} was over ${money0(mtd.inUse.threshold.value)}.`;
	}

	const test = mtd.incomeTest;
	if (!has(test.threshold) || !has(test.startDate)) {
		const why = test.threshold.note ?? test.startDate.note ?? `No threshold for ${year.label} income has been recorded`;
		return {
			position: 'not-set',
			threshold: null,
			startDate: null,
			provenance,
			line: {
				id: 'making-tax-digital',
				label: `Making Tax Digital: threshold for ${year.label} income not set`,
				kind: 'info',
				rate: null,
				slice: null,
				amount: income,
				sign: 0,
				provenance: provenance[0] ?? null,
				arithmetic: `${basis} ${why}.${inUse}`,
			},
		};
	}

	const threshold = test.threshold.value;
	const startDate = test.startDate.value;
	const thresholdProvenance = provenanceOf(test.threshold);
	provenance.unshift(thresholdProvenance, provenanceOf(test.startDate));
	const above = income > threshold;
	return {
		position: above ? 'above' : 'not-above',
		threshold,
		startDate,
		provenance,
		line: {
			id: 'making-tax-digital',
			label: `Making Tax Digital: ${above ? 'above' : 'not above'} the ${money0(threshold)} threshold`,
			kind: 'info',
			rate: null,
			slice: null,
			amount: income,
			sign: 0,
			provenance: thresholdProvenance,
			arithmetic: `${basis} HMRC tests qualifying income for ${year.label}, as reported on the tax return for that year, against ${money0(threshold)}. Over that, Making Tax Digital for Income Tax applies from ${longDate(startDate)}, unless an exemption applies. ${money(income)} is ${above ? 'over' : 'not over'} ${money0(threshold)}.${inUse}`,
		},
	};
}

/**
 * Adds the sources of an information line to the rules used, widening the
 * checked dates. The status is left alone: it describes the figures that
 * produce the tax, and the information line shows its own status.
 */
export function withInformationSources(rules: RulesUsed, extra: Provenance[]): RulesUsed {
	const sources = [...rules.sources];
	for (const p of extra) if (p.source && !sources.some((s) => s.source === p.source)) sources.push({ source: p.source, verified: p.verified, status: p.status });
	const dates = [rules.verifiedFrom, rules.verifiedTo, ...extra.map((p) => p.verified)].filter(Boolean).sort();
	return { ...rules, sources, verifiedFrom: dates[0] ?? '', verifiedTo: dates[dates.length - 1] ?? '' };
}
