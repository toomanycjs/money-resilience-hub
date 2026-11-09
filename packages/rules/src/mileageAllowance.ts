// Approved mileage: business miles in the year at the approved rate for
// the vehicle, what an employer paid against it, and Mileage Allowance
// Relief on the unused balance with the income tax it takes off.

import { getYear, today, yearFor } from './config.ts';
import { round2 } from './rounding.ts';
import { incomeTaxOn, miles as fmtMiles, need, nextYearLine, pence } from './payShared.ts';
import { asAtWithin, money, Used } from './simple.ts';
import { RulesUnavailableError, type LedgerLine, type Nation, type SimpleResult, type YearConfig } from './types.ts';

export type MileageVehicle = 'car' | 'motorcycle' | 'cycle';
export const MILEAGE_VEHICLES: MileageVehicle[] = ['car', 'motorcycle', 'cycle'];
export const MILEAGE_VEHICLE_LABEL: Record<MileageVehicle, string> = { car: 'Car or van', motorcycle: 'Motorcycle', cycle: 'Cycle' };

export interface MileageAllowanceInput {
	vehicle: MileageVehicle;
	/** Business miles in the tax year in your own vehicle. */
	miles: number;
	/** What the employer paid for those miles in the year. */
	employerPaid: number;
	/** Taxable income for the year, which sets the rate of relief. */
	income: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const MILEAGE_TOUCHES = /^mileage\./;

export function mileageAllowance(input: MileageAllowanceInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const vehicle: MileageVehicle = MILEAGE_VEHICLES.includes(input.vehicle) ? input.vehicle : 'car';
	const distance = Math.min(1_000_000, Math.max(0, Math.round(input.miles || 0)));
	const paid = Math.max(0, round2(input.employerPaid || 0));
	const income = Math.max(0, round2(input.income || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];
	const m = year.mileage;
	if (!m) throw new RulesUnavailableError(`mileage: The approved mileage rates for ${year.label} have not been recorded`, 'mileage');

	let approved = 0;
	let firstBand = 0;
	let afterBand = 0;
	if (vehicle === 'car') {
		const firstRate = need(m.carFirstRate, 'mileage.carFirstRate', asAt, 'The car rate');
		const firstMiles = need(m.carFirstMiles, 'mileage.carFirstMiles', asAt, 'The first band of miles');
		const afterRate = need(m.carAfterRate, 'mileage.carAfterRate', asAt, 'The car rate above the first band');
		used.add(firstRate);
		used.add(firstMiles);
		const inFirst = Math.min(distance, firstMiles.value);
		const above = Math.max(0, distance - firstMiles.value);
		firstBand = round2(inFirst * firstRate.value);
		afterBand = round2(above * afterRate.value);
		approved = round2(firstBand + afterBand);
		lines.push({ id: 'first-band', label: `First ${fmtMiles(firstMiles.value)} miles`, kind: 'income', rate: null, slice: null, amount: firstBand, sign: 1, provenance: firstRate.provenance, arithmetic: `${fmtMiles(inFirst)} miles × ${pence(firstRate.value)} = ${money(firstBand)}.` });
		if (above > 0) {
			used.add(afterRate);
			lines.push({ id: 'after-band', label: `Miles above ${fmtMiles(firstMiles.value)}`, kind: 'income', rate: null, slice: null, amount: afterBand, sign: 1, provenance: afterRate.provenance, arithmetic: `${fmtMiles(above)} miles × ${pence(afterRate.value)} = ${money(afterBand)}.` });
		}
	} else {
		const rate = need(m[vehicle], `mileage.${vehicle}`, asAt, `The ${vehicle} rate`);
		used.add(rate);
		approved = round2(distance * rate.value);
		firstBand = approved;
		lines.push({ id: 'all-miles', label: `${MILEAGE_VEHICLE_LABEL[vehicle]} miles`, kind: 'income', rate: null, slice: null, amount: approved, sign: 1, provenance: rate.provenance, arithmetic: `${fmtMiles(distance)} miles × ${pence(rate.value)} = ${money(approved)}. The same rate applies to every mile.` });
	}
	lines.push({ id: 'approved', label: 'Approved amount', kind: 'total', rate: null, slice: null, amount: approved, sign: 1, provenance: null, arithmetic: `What an employer can pay for ${fmtMiles(distance)} business miles in the year free of tax: ${money(approved)}.` });

	const relief = round2(Math.max(0, approved - paid));
	const taxable = round2(Math.max(0, paid - approved));
	lines.push({ id: 'paid', label: 'Paid by your employer', kind: 'info', rate: null, slice: null, amount: paid, sign: 0, provenance: null, arithmetic: paid > 0 ? `Mileage payments received in the year for these miles: ${money(paid)}.` : 'No mileage payments from an employer entered.' });

	// The relief is a deduction from taxable income; its worth is the tax it removes.
	const withRelief = incomeTaxOn(Math.max(0, income - relief), year, input.nation, asAt, used);
	const without = incomeTaxOn(income, year, input.nation, asAt, used);
	const taxRelief = round2(without.total - withRelief.total);
	const top = without.slices[without.slices.length - 1];
	lines.push({
		id: 'relief',
		label: 'Mileage Allowance Relief',
		kind: 'info',
		rate: null,
		slice: null,
		amount: relief,
		sign: 0,
		provenance: lines[0].provenance,
		arithmetic: relief > 0 ? `The employer paid less than the approved amount, so the unused balance can be claimed as a deduction from taxable income: ${money(approved)} − ${money(paid)} = ${money(relief)}.` : `The employer paid at least the approved amount, so there is no unused balance to claim.`,
	});
	lines.push({
		id: 'tax-relief',
		label: 'Income tax taken off by the relief',
		kind: 'info',
		rate: relief > 0 ? round2((taxRelief / relief) * 10000) / 10000 : null,
		slice: relief,
		amount: taxRelief,
		sign: 0,
		provenance: top ? top.provenance : lines[0].provenance,
		arithmetic: relief > 0 ? `Income tax on ${money(income)} is ${money(without.total)}; on ${money(round2(Math.max(0, income - relief)))} it is ${money(withRelief.total)}. The relief is worth ${money(taxRelief)}.` : 'No relief, so no tax is taken off.',
	});
	if (taxable > 0) warnings.push(`The employer paid ${money(taxable)} more than the approved amount. The excess is taxed as pay.`);
	if (relief > 0 && taxRelief === 0) warnings.push(`Taxable income of ${money(income)} carries no income tax, so the relief takes nothing off.`);

	const note =
		distance === 0
			? 'Enter the business miles for the year.'
			: relief > 0
				? `The approved amount is ${money(approved)}. The employer paid ${money(paid)}, leaving ${money(relief)} of Mileage Allowance Relief, which takes ${money(taxRelief)} off income tax.`
				: taxable > 0
					? `The approved amount is ${money(approved)}. The employer paid ${money(taxable)} more than that, and the excess is taxed as pay.`
					: `The approved amount is ${money(approved)}, and the employer paid exactly that.`;

	const result: SimpleResult = {
		tool: 'mileage-allowance',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Approved mileage amount', amount: approved, unit: 'a year' },
		figures: [
			{ label: 'Paid by your employer', amount: paid },
			{ label: 'Mileage Allowance Relief', amount: relief },
			{ label: 'Tax taken off', amount: taxRelief },
		],
		note,
		lines,
		caption: `The approved amount for ${fmtMiles(distance)} business miles by ${MILEAGE_VEHICLE_LABEL[vehicle].toLowerCase()} in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { approved, firstBand, afterBand, relief, taxRelief, taxable },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(
			result,
			year,
			(taxYear, at) => mileageAllowance({ ...input, taxYear, asAt: at, compare: false }),
			'approved mileage',
			(next) => {
				if (vehicle !== 'car' || !next.mileage) return '';
				const now = need(m.carAfterRate, 'mileage.carAfterRate', asAt, 'The car rate above the first band').value;
				const then = need(next.mileage.carAfterRate, 'mileage.carAfterRate', next.starts, 'The car rate above the first band').value;
				const band = need(m.carFirstMiles, 'mileage.carFirstMiles', asAt, 'The first band of miles').value;
				return now !== then ? `The car rate above ${fmtMiles(band)} miles moves from ${pence(now)} to ${pence(then)}.` : '';
			},
		);
	}
	return result;
}
