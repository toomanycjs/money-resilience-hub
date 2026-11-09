// Rows for the rates pages, rendered straight from a year's config so the
// figure a tool uses and the figure the reference shows are the same value.

import { NATION_LABEL, type Band, type Leaf, type Nation, type Status, type YearConfig } from '@money-resilience-hub/rules';
import { money, pct } from '@money-resilience-hub/calculators';

export interface RateRow {
	path: string;
	label: string;
	value: string;
	source: string;
	verified: string;
	status: Status;
	note?: string;
	effectiveFrom?: string;
}

export interface RateTable {
	id: string;
	heading: string;
	rows: RateRow[];
}

export const LABELS: Record<string, string> = {
	'incomeTax.personalAllowance': 'Personal allowance',
	'incomeTax.taperStart': 'Income limit for the personal allowance',
	'incomeTax.taperRate': 'Allowance lost per £1 of income above the limit',
	'incomeTax.marriageAllowanceTransfer': 'Marriage allowance transfer',
	'incomeTax.savings.startingRateLimit': 'Starting rate for savings',
	'incomeTax.savings.startingRateIncomeCeiling': 'Starting rate for savings: other income limit',
	'incomeTax.savings.personalSavingsAllowance.basic': 'Personal savings allowance, basic rate',
	'incomeTax.savings.personalSavingsAllowance.higher': 'Personal savings allowance, higher rate',
	'incomeTax.savings.personalSavingsAllowance.additional': 'Personal savings allowance, additional rate',
	'incomeTax.savings.rates.basic': 'Savings basic rate',
	'incomeTax.savings.rates.higher': 'Savings higher rate',
	'incomeTax.savings.rates.additional': 'Savings additional rate',
	'incomeTax.property.rates.basic': 'Property income basic rate',
	'incomeTax.property.rates.higher': 'Property income higher rate',
	'incomeTax.property.rates.additional': 'Property income additional rate',
	'incomeTax.property.scotlandRates': 'Property income rates, Scotland',
	'incomeTax.dividends.allowance': 'Dividend allowance',
	'incomeTax.dividends.rates.basic': 'Dividend ordinary rate',
	'incomeTax.dividends.rates.higher': 'Dividend upper rate',
	'incomeTax.dividends.rates.additional': 'Dividend additional rate',
	'incomeTax.tradingAllowance': 'Trading allowance',
	'incomeTax.propertyAllowance': 'Property allowance',
	'nationalInsurance.employee.mainRate': 'Employee main rate',
	'nationalInsurance.employee.upperRate': 'Employee rate above the upper earnings limit',
	'nationalInsurance.employee.lowerEarningsLimit': 'Lower earnings limit',
	'nationalInsurance.employee.primaryThreshold': 'Primary threshold',
	'nationalInsurance.employee.upperEarningsLimit': 'Upper earnings limit',
	'nationalInsurance.employer.rate': 'Employer rate',
	'nationalInsurance.employer.secondaryThreshold': 'Secondary threshold',
	'nationalInsurance.employer.employmentAllowance': 'Employment allowance',
	'nationalInsurance.selfEmployed.class2Weekly': 'Class 2, weekly',
	'nationalInsurance.selfEmployed.smallProfitsThreshold': 'Small profits threshold',
	'nationalInsurance.selfEmployed.class4.lowerProfitsLimit': 'Class 4 lower profits limit',
	'nationalInsurance.selfEmployed.class4.upperProfitsLimit': 'Class 4 upper profits limit',
	'nationalInsurance.selfEmployed.class4.mainRate': 'Class 4 main rate',
	'nationalInsurance.selfEmployed.class4.upperRate': 'Class 4 rate above the upper profits limit',
	'studentLoans.plan1.threshold': 'Plan 1 threshold',
	'studentLoans.plan1.rate': 'Plan 1 rate',
	'studentLoans.plan2.threshold': 'Plan 2 threshold',
	'studentLoans.plan2.rate': 'Plan 2 rate',
	'studentLoans.plan4.threshold': 'Plan 4 threshold',
	'studentLoans.plan4.rate': 'Plan 4 rate',
	'studentLoans.plan5.threshold': 'Plan 5 threshold',
	'studentLoans.plan5.rate': 'Plan 5 rate',
	'studentLoans.postgraduate.threshold': 'Postgraduate loan threshold',
	'studentLoans.postgraduate.rate': 'Postgraduate loan rate',
	'childBenefit.chargeFrom': 'High income child benefit charge starts',
	'childBenefit.chargeTo': 'Charge reaches 100%',
	'childBenefit.chargeStep': 'Income per 1% of charge',
	'childBenefit.weeklyEldest': 'Child benefit, eldest or only child, weekly',
	'childBenefit.weeklyAdditional': 'Child benefit, each additional child, weekly',
	'statutoryPay.ssp.weekly': 'Statutory sick pay, weekly',
	'statutoryPay.ssp.earningsFraction': 'Statutory sick pay, share of average weekly earnings if lower',
	'statutoryPay.ssp.maxWeeks': 'Statutory sick pay, maximum weeks',
	'statutoryPay.smp.weekly': 'Statutory maternity pay, weekly after the first six weeks',
	'statutoryPay.smp.earningsFraction': 'Statutory maternity pay, share of average weekly earnings',
	'statutoryPay.smp.fullRateWeeks': 'Statutory maternity pay, weeks at the earnings rate',
	'minimumWage.age21AndOver': 'National living wage, 21 and over, hourly',
	'minimumWage.age18To20': 'Minimum wage, 18 to 20, hourly',
	'minimumWage.under18': 'Minimum wage, under 18, hourly',
	'minimumWage.apprentice': 'Apprentice rate, hourly',
	'mileage.carFirstRate': 'Car mileage, first band, per mile',
	'mileage.carFirstMiles': 'Car mileage, first band, miles',
	'mileage.carAfterRate': 'Car mileage, after the first band, per mile',
	'mileage.motorcycle': 'Motorcycle mileage, per mile',
	'mileage.cycle': 'Cycle mileage, per mile',
	'isa.annualLimit': 'ISA annual limit',
	'isa.cashLimit': 'Cash ISA annual limit',
	'isa.lifetimeIsa.propertyCap': 'Lifetime ISA property price cap',
	'isa.lifetimeIsa.withdrawalCharge': 'Lifetime ISA withdrawal charge',
	'isa.lifetimeIsa.firstHomeOverCapCharge': 'Lifetime ISA charge, first home above the cap',
	'isa.lifetimeIsa.bonusRate': 'Lifetime ISA government bonus',
	'isa.lifetimeIsa.annualLimit': 'Lifetime ISA annual limit',
	'statePension.fullNewWeekly': 'Full new State Pension, weekly',
	'pensionTaxAllowance.fullNewStatePension': 'Full new State Pension, annual',
	'pensionTaxAllowance.rate': 'Pension Tax Allowance rate on the gap above the personal allowance',
	'pensionTaxAllowance.taperDivisor': 'Pension Tax Allowance: income per £1 withdrawn',
	'pensionTaxAllowance.lastYear': 'Pension Tax Allowance: last tax year',
};

const SECTIONS: { id: string; heading: string; prefix: string }[] = [
	{ id: 'income-tax', heading: 'Income tax', prefix: 'incomeTax.' },
	{ id: 'national-insurance', heading: 'National Insurance', prefix: 'nationalInsurance.' },
	{ id: 'student-loans', heading: 'Student loans', prefix: 'studentLoans.' },
	{ id: 'child-benefit', heading: 'Child benefit', prefix: 'childBenefit.' },
	{ id: 'statutory-pay', heading: 'Statutory pay', prefix: 'statutoryPay.' },
	{ id: 'minimum-wage', heading: 'Minimum wage', prefix: 'minimumWage.' },
	{ id: 'mileage', heading: 'Mileage allowance', prefix: 'mileage.' },
	{ id: 'isa', heading: 'ISAs', prefix: 'isa.' },
	{ id: 'state-pension', heading: 'State Pension', prefix: 'statePension.' },
	{ id: 'pension-tax-allowance', heading: 'Pension Tax Allowance', prefix: 'pensionTaxAllowance.' },
];

function isLeaf(x: unknown): x is Leaf<unknown> {
	return !!x && typeof x === 'object' && 'value' in (x as object) && 'status' in (x as object);
}

export function formatRateValue(path: string, value: unknown): string {
	if (value === null || value === undefined) return 'Not set';
	if (typeof value === 'string') return value;
	if (typeof value !== 'number') return String(value);
	if (/mileage\.\w+Rate$|mileage\.(motorcycle|cycle)$/.test(path)) return `${Math.round(value * 100)}p`;
	if (/Miles$|maxWeeks$|fullRateWeeks$|taperDivisor$|chargeStep$/.test(path)) return path.endsWith('chargeStep') ? money(value, 0) : String(value);
	if (/[rR]ate$|[fF]raction$|Charge$|rates\.(basic|higher|additional)$/.test(path)) return pct(value);
	if (/minimumWage|class2Weekly|weekly$|[wW]eekly$|weeklyEldest|weeklyAdditional|fullNewStatePension/.test(path)) return money(value, 2);
	return money(value, 0);
}

function collect(node: unknown, path: string, out: RateRow[]) {
	if (isLeaf(node)) {
		const leaf = node as Leaf<unknown>;
		out.push({
			path,
			label: LABELS[path] ?? path,
			value: formatRateValue(path, leaf.value),
			source: leaf.source,
			verified: leaf.verified,
			status: leaf.status,
			note: leaf.note,
			effectiveFrom: leaf.effectiveFrom,
		});
		if (leaf.previous) out.push({ path: `${path}.previous`, label: `${LABELS[path] ?? path}, before ${leaf.effectiveFrom}`, value: formatRateValue(path, leaf.previous.value), source: leaf.previous.source, verified: leaf.previous.verified, status: leaf.previous.status });
		return;
	}
	if (Array.isArray(node)) return;
	if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node)) {
			if (k === 'bands' || k === 'effectiveFrom') continue;
			collect(v, path ? `${path}.${k}` : k, out);
		}
	}
}

export function rateTables(year: YearConfig): RateTable[] {
	const all: RateRow[] = [];
	collect(year, '', all);
	return SECTIONS.map((s) => ({ id: s.id, heading: s.heading, rows: all.filter((r) => r.path.startsWith(s.prefix)) })).filter((t) => t.rows.length);
}

export interface BandRow {
	nation: Nation;
	nationLabel: string;
	bands: (Band & { from: number })[];
}

export function bandTables(year: YearConfig): BandRow[] {
	return (Object.keys(year.incomeTax.bands) as Nation[]).map((n) => {
		let lower = 0;
		const bands = year.incomeTax.bands[n].map((b) => {
			const row = { ...b, from: lower };
			lower = b.upTo ?? lower;
			return row;
		});
		return { nation: n, nationLabel: NATION_LABEL[n], bands };
	});
}
