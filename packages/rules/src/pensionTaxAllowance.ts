// The Pension Tax Allowance for people over State Pension age, 2027/28 to 2029/30.

import { resolve } from './config.ts';
import { ceilPound, round2 } from './rounding.ts';
import { RulesUnavailableError, type Provenance, type YearConfig } from './types.ts';

export interface PensionTaxAllowanceResult {
	maximum: number;
	allowance: number;
	fullNewStatePension: number;
	withdrawnAt: number;
	provenance: Provenance;
}

/**
 * The maximum is 20% of the gap between the full new State Pension and the
 * personal allowance, rounded up to a pound (HMRC's explainer gives "up to
 * £94" for a gap of £466.40). It is withdrawn at £1 for every £3 of income
 * above the full new State Pension.
 */
export function pensionTaxAllowance(totalIncome: number, year: YearConfig, asAt: string): PensionTaxAllowanceResult {
	const cfg = year.pensionTaxAllowance;
	if (!cfg) throw new RulesUnavailableError(`The Pension Tax Allowance does not apply in ${year.label}`, 'pensionTaxAllowance');
	if (cfg.effectiveFrom && asAt < cfg.effectiveFrom) throw new RulesUnavailableError(`The Pension Tax Allowance applies from ${cfg.effectiveFrom}`, 'pensionTaxAllowance');
	const nsp = resolve(cfg.fullNewStatePension, 'pensionTaxAllowance.fullNewStatePension', asAt);
	const rate = resolve(cfg.rate, 'pensionTaxAllowance.rate', asAt).value;
	const divisor = resolve(cfg.taperDivisor, 'pensionTaxAllowance.taperDivisor', asAt).value;
	const pa = resolve(year.incomeTax.personalAllowance, 'incomeTax.personalAllowance', asAt).value;
	const maximum = ceilPound(rate * (nsp.value - pa));
	const excess = Math.max(0, totalIncome - nsp.value);
	const allowance = round2(Math.max(0, maximum - excess / divisor));
	return { maximum, allowance, fullNewStatePension: nsp.value, withdrawnAt: round2(nsp.value + maximum * divisor), provenance: nsp.provenance };
}
