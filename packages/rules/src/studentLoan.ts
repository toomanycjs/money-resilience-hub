// Student loan repayments through PAYE: the plan rate on earnings above
// the plan threshold, rounded down to a whole pound.

import { resolve } from './config.ts';
import { floorPound } from './rounding.ts';
import { RulesUnavailableError, type Plan, type Provenance, type YearConfig } from './types.ts';

export interface StudentLoanResult {
	plan: Plan;
	threshold: number;
	rate: number;
	slice: number;
	amount: number;
	provenance: Provenance;
}

export function studentLoan(earnings: number, plan: Plan, year: YearConfig, asAt: string): StudentLoanResult {
	const cfg = year.studentLoans[plan];
	if (!cfg) throw new RulesUnavailableError(`No ${plan} rules for ${year.taxYear}`, `studentLoans.${plan}`);
	const threshold = resolve(cfg.threshold, `studentLoans.${plan}.threshold`, asAt);
	const rate = resolve(cfg.rate, `studentLoans.${plan}.rate`, asAt);
	const slice = Math.max(0, earnings - threshold.value);
	return { plan, threshold: threshold.value, rate: rate.value, slice, amount: floorPound(slice * rate.value), provenance: threshold.provenance };
}
