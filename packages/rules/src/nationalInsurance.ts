// Employee Class 1 National Insurance, category A, on annual earnings.

import { resolve } from './config.ts';
import { round2 } from './rounding.ts';
import type { BandResult, YearConfig } from './types.ts';

export interface NationalInsuranceResult {
	total: number;
	bands: BandResult[];
}

export function nationalInsurance(earnings: number, year: YearConfig, asAt: string): NationalInsuranceResult {
	const e = year.nationalInsurance.employee;
	const pt = resolve(e.primaryThreshold, 'nationalInsurance.employee.primaryThreshold', asAt);
	const uel = resolve(e.upperEarningsLimit, 'nationalInsurance.employee.upperEarningsLimit', asAt);
	const main = resolve(e.mainRate, 'nationalInsurance.employee.mainRate', asAt);
	const upper = resolve(e.upperRate, 'nationalInsurance.employee.upperRate', asAt);

	const bands: BandResult[] = [];
	const mainSlice = Math.max(0, Math.min(earnings, uel.value) - pt.value);
	if (mainSlice > 0) bands.push({ name: 'Main rate', rate: main.value, from: pt.value, to: uel.value, slice: mainSlice, tax: round2(mainSlice * main.value), provenance: main.provenance });
	const upperSlice = Math.max(0, earnings - uel.value);
	if (upperSlice > 0) bands.push({ name: 'Above the upper earnings limit', rate: upper.value, from: uel.value, to: null, slice: upperSlice, tax: round2(upperSlice * upper.value), provenance: upper.provenance });

	return { total: round2(bands.reduce((s, b) => s + b.tax, 0)), bands };
}

/** Employer Class 1 on the same earnings, before the employment allowance. */
export function employerNationalInsurance(earnings: number, year: YearConfig, asAt: string): { total: number; rate: number; threshold: number; slice: number } {
	const e = year.nationalInsurance.employer;
	const st = resolve(e.secondaryThreshold, 'nationalInsurance.employer.secondaryThreshold', asAt).value;
	const rate = resolve(e.rate, 'nationalInsurance.employer.rate', asAt).value;
	const slice = Math.max(0, earnings - st);
	return { total: round2(slice * rate), rate, threshold: st, slice };
}
