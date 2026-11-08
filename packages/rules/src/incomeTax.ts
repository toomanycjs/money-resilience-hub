// Income tax on taxable income, band by band, for a nation and year.

import { provenanceOf, resolve } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { RulesUnavailableError, type AllowanceResult, type Band, type BandResult, type Nation, type YearConfig } from './types.ts';

export interface IncomeTaxResult {
	total: number;
	bands: BandResult[];
	capped: boolean;
}

/** The bands for a nation, checked for unset values. `extendBy` lifts every band top (relief at source). */
export function bandsFor(year: YearConfig, nation: Nation, extendBy = 0): Band[] {
	const bands = year.incomeTax.bands[nation];
	if (!bands?.length) throw new RulesUnavailableError(`No income tax bands for ${nation} in ${year.taxYear}`, `incomeTax.bands.${nation}`);
	return bands.map((b) => {
		if (b.rate === null) {
			throw new RulesUnavailableError(b.note ?? `${b.name} for ${nation} in ${year.taxYear} is not set`, `incomeTax.bands.${nation}`);
		}
		return b.upTo === null ? b : { ...b, upTo: b.upTo + extendBy };
	});
}

/**
 * Tax on `taxable` (already net of the allowance, rounded down to a pound).
 * BR, D0 and D1 codes charge everything at one band's rate.
 */
export function incomeTax(taxable: number, nation: Nation, year: YearConfig, options: { flatBand?: 'BR' | 'D0' | 'D1'; extendBy?: number; capAt?: number | null } = {}): IncomeTaxResult {
	const bands = bandsFor(year, nation, options.extendBy ?? 0);
	const income = Math.max(0, floorPound(taxable));
	const results: BandResult[] = [];

	if (options.flatBand) {
		const index = { BR: 0, D0: 1, D1: 2 }[options.flatBand];
		const band = bands[Math.min(index, bands.length - 1)];
		const tax = round2(income * (band.rate as number));
		results.push({ name: band.name, rate: band.rate as number, from: 0, to: null, slice: income, tax, provenance: provenanceOf(band) });
	} else {
		let lower = 0;
		for (const band of bands) {
			const upper = band.upTo ?? Infinity;
			const slice = Math.max(0, Math.min(income, upper) - lower);
			if (slice > 0) {
				results.push({ name: band.name, rate: band.rate as number, from: lower, to: band.upTo, slice, tax: round2(slice * (band.rate as number)), provenance: provenanceOf(band) });
			}
			lower = upper;
			if (income <= upper) break;
		}
	}

	let total = round2(results.reduce((s, b) => s + b.tax, 0));
	let capped = false;
	if (options.capAt != null && total > options.capAt) {
		total = round2(options.capAt);
		capped = true;
	}
	return { total, bands: results, capped };
}

/** Taxable income from pay and a parsed code: pay minus allowance plus any K addition. */
export function taxableIncome(taxableGross: number, allowance: AllowanceResult): number {
	return Math.max(0, floorPound(taxableGross - allowance.allowance + allowance.kAddition));
}

/** Marriage allowance saving for the recipient: the transfer times the basic rate. */
export function marriageAllowanceSaving(year: YearConfig, nation: Nation, asAt: string): number {
	const transfer = resolve(year.incomeTax.marriageAllowanceTransfer, 'incomeTax.marriageAllowanceTransfer', asAt).value;
	const basic = bandsFor(year, nation).find((b) => b.name === 'Basic rate') ?? bandsFor(year, nation)[0];
	return round2(transfer * (basic.rate as number));
}
