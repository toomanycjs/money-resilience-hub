// Runs every fixture in packages/rules/fixtures against the engine.
// Fixtures come from HMRC and gov.uk worked examples, and from edge cases
// written from gov.uk pages alone by someone who had not seen the engine.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getYear, incomeTax, landlordTax, lifetimeIsaPenalty, marriageAllowanceSaving, pensionTaxAllowance, savingsTax, sideHustleTax, statePensionTax, takeHome, type Nation, type Plan, type SimpleResult } from '../src/index';
import { bonusTax, childBenefitCharge, hourlyToSalary, maternityPay, mileageAllowance, paternityPay, payRise, pensionContributions } from '../src/index';
import { lifetimeInterestRate, studentLoanLifetime, type LifetimeInput } from '../src/index';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

interface Fixture {
	id: string;
	title: string;
	fn?: 'takeHome' | 'pensionTaxAllowance' | 'marriageAllowanceSaving' | 'studentLoanLifetime' | 'lifetimeInterestRate' | keyof typeof SIMPLE;
	taxYear: string;
	asAt?: string;
	sources: string[];
	input: { gross?: number; nation: Nation; taxCode?: string; studentLoanPlans?: Plan[] } & Record<string, unknown>;
	expected: Record<string, number | string>;
	tolerance?: number;
}

/** The single-purpose tools: each takes its fixture input plus the year and date, and reports named facts. */
const SIMPLE: Record<string, (input: Record<string, unknown>, taxYear: string, asAt: string) => SimpleResult> = {
	savingsTax: (i, taxYear, asAt) => savingsTax({ ...(i as unknown as Parameters<typeof savingsTax>[0]), taxYear, asAt }),
	landlordTax: (i, taxYear, asAt) => landlordTax({ ...(i as unknown as Parameters<typeof landlordTax>[0]), taxYear, asAt }),
	statePensionTax: (i, taxYear, asAt) => statePensionTax({ ...(i as unknown as Parameters<typeof statePensionTax>[0]), taxYear, asAt }),
	sideHustleTax: (i, taxYear, asAt) => sideHustleTax({ ...(i as unknown as Parameters<typeof sideHustleTax>[0]), taxYear, asAt }),
	lifetimeIsaPenalty: (i) => lifetimeIsaPenalty(i as unknown as Parameters<typeof lifetimeIsaPenalty>[0]),
	payRise: (i, taxYear, asAt) => payRise({ ...(i as unknown as Parameters<typeof payRise>[0]), taxYear, asAt }),
	bonusTax: (i, taxYear, asAt) => bonusTax({ ...(i as unknown as Parameters<typeof bonusTax>[0]), taxYear, asAt }),
	pensionContributions: (i, taxYear, asAt) => pensionContributions({ ...(i as unknown as Parameters<typeof pensionContributions>[0]), taxYear, asAt }),
	hourlyToSalary: (i, taxYear, asAt) => hourlyToSalary({ ...(i as unknown as Parameters<typeof hourlyToSalary>[0]), taxYear, asAt }),
	childBenefitCharge: (i, taxYear, asAt) => childBenefitCharge({ ...(i as unknown as Parameters<typeof childBenefitCharge>[0]), taxYear, asAt }),
	mileageAllowance: (i, taxYear, asAt) => mileageAllowance({ ...(i as unknown as Parameters<typeof mileageAllowance>[0]), taxYear, asAt }),
	maternityPay: (i, taxYear, asAt) => maternityPay({ ...(i as unknown as Parameters<typeof maternityPay>[0]), taxYear, asAt }),
	paternityPay: (i, taxYear, asAt) => paternityPay({ ...(i as unknown as Parameters<typeof paternityPay>[0]), taxYear, asAt }),
};

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

for (const file of files) {
	const fixtures: Fixture[] = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
	describe(file, () => {
		for (const f of fixtures) {
			it(`${f.id}: ${f.title}`, () => {
				expect(f.sources.length, 'every fixture cites a source').toBeGreaterThan(0);
				const tol = f.tolerance ?? 0.005;
				const asAt = f.asAt ?? getYear(f.taxYear).starts;
				if (f.fn === 'pensionTaxAllowance') {
					const year = getYear(f.taxYear);
					const income = f.input.gross as number;
					const pa = year.incomeTax.personalAllowance.value as number;
					const before = incomeTax(income - pa, f.input.nation, year).total;
					const pta = pensionTaxAllowance(income, year, asAt);
					const after = Math.max(0, Math.round((before - pta.allowance) * 100) / 100);
					const got: Record<string, number> = { incomeTaxBefore: before, pensionTaxAllowance: pta.allowance, incomeTaxAfter: after, withdrawnAt: pta.withdrawnAt };
					for (const [k, v] of Object.entries(f.expected)) expect(Math.abs(got[k] - v), `${k}: expected ${v}, got ${got[k]}`).toBeLessThanOrEqual(tol);
					return;
				}
				if (f.fn === 'marriageAllowanceSaving') {
					expect(marriageAllowanceSaving(getYear(f.taxYear), f.input.nation, asAt)).toBeCloseTo(f.expected.saving as number, 2);
					return;
				}
				if (f.fn === 'lifetimeInterestRate') {
					// The Plan 2 rate for each salary, uncapped and capped.
					const i = f.input as unknown as { salaries: number[]; lower: number; upper: number; rpi: number; extraMax: number; cap: number };
					const rule = { rpi: i.rpi, extraMax: i.extraMax, lowerIncome: i.lower, upperIncome: i.upper, cap: null };
					const got: Record<string, number> = {};
					i.salaries.forEach((s, n) => {
						got[`rate${n}`] = lifetimeInterestRate(s, i.lower, i.upper, rule);
						got[`capped${n}`] = lifetimeInterestRate(s, i.lower, i.upper, rule, i.cap);
					});
					for (const [k, v] of Object.entries(f.expected)) expect(Math.abs(got[k] - (v as number)), `${k}: expected ${v}, got ${got[k]}`).toBeLessThanOrEqual(tol);
					return;
				}
				if (f.fn === 'studentLoanLifetime') {
					// The threshold and rate come from the rules file for the starting year; the rest of the input is the fixture's assumptions.
					const year = getYear(f.taxYear);
					const i = f.input as unknown as Omit<LifetimeInput, 'threshold' | 'rate' | 'startYear'>;
					const cfg = year.studentLoans[i.plan];
					const r = studentLoanLifetime({ ...i, threshold: cfg.threshold.value as number, rate: cfg.rate.value as number, startYear: f.taxYear });
					const got: Record<string, number | string> = { yearsModelled: r.years.length, totalRepaid: r.totalRepaid, totalInterest: r.totalInterest, clearedInYear: r.clearedInYear ?? 'written off', clearedInTaxYear: r.clearedInTaxYear ?? 'written off', writtenOffBalance: r.writtenOffBalance };
					for (const y of r.years) {
						got[`year${y.year}Rate`] = y.interestRate;
						got[`year${y.year}Salary`] = y.salary;
						got[`year${y.year}Threshold`] = y.threshold;
						got[`year${y.year}Repaid`] = y.repaid;
						got[`year${y.year}Interest`] = y.interest;
						got[`year${y.year}Closing`] = y.closing;
					}
					for (const [k, v] of Object.entries(f.expected)) {
						if (typeof v === 'string') expect(got[k], k).toBe(v);
						else expect(Math.abs((got[k] as number) - v), `${k}: expected ${v}, got ${got[k]}`).toBeLessThanOrEqual(tol);
					}
					return;
				}
				if (f.fn && f.fn in SIMPLE) {
					const r = SIMPLE[f.fn](f.input, f.taxYear, asAt);
					expect(r.taxYear).toBe(f.taxYear);
					for (const [k, v] of Object.entries(f.expected)) {
						const got = r.facts[k];
						if (typeof v === 'string') expect(got, k).toBe(v);
						else expect(Math.abs((got as number) - v), `${k}: expected ${v}, got ${got}`).toBeLessThanOrEqual(tol);
					}
					for (const line of r.lines.filter((l) => l.kind === 'band' || l.kind === 'deduction')) {
						expect(line.provenance?.source, `${f.id}: ${line.label}`).toMatch(/^https:\/\//);
					}
					return;
				}
				const r = takeHome({ gross: f.input.gross as number, nation: f.input.nation, taxCode: f.input.taxCode, studentLoanPlans: f.input.studentLoanPlans ?? [], taxYear: f.taxYear, asAt });
				const got: Record<string, number> = {
					personalAllowance: r.allowance.allowance,
					incomeTax: r.incomeTax.total,
					nationalInsurance: r.nationalInsurance.total,
					studentLoan: r.studentLoans.total,
					takeHome: r.takeHome,
				};
				for (const [k, v] of Object.entries(f.expected)) {
					expect(Math.abs(got[k] - (v as number)), `${k}: expected ${v}, got ${got[k]}`).toBeLessThanOrEqual(tol);
				}
			});
		}
	});
}

describe('engine behaviour', () => {
	it('every line in the ledger that deducts money carries a source', () => {
		const r = takeHome({ gross: 45000, nation: 'scotland', studentLoanPlans: ['plan4'], taxYear: '2026-27', asAt: '2026-11-07' });
		for (const line of r.lines.filter((l) => l.kind === 'band' || l.kind === 'deduction')) {
			expect(line.provenance?.source, line.label).toMatch(/^https:\/\//);
			expect(line.provenance?.verified, line.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
		expect(r.lines.filter((l) => l.sign === -1).reduce((s, l) => s + l.amount, 0)).toBeCloseTo(r.gross - r.takeHome, 2);
	});

	it('salary sacrifice reduces NI and net pay does not', () => {
		const base = { gross: 40000, nation: 'england-ni' as const, taxYear: '2026-27', asAt: '2026-11-07' };
		const none = takeHome(base);
		const sacrifice = takeHome({ ...base, pension: { type: 'salary-sacrifice', percent: 5 } });
		const netPay = takeHome({ ...base, pension: { type: 'net-pay', percent: 5 } });
		const ras = takeHome({ ...base, pension: { type: 'relief-at-source', percent: 5 } });
		expect(sacrifice.nationalInsurance.total).toBeLessThan(none.nationalInsurance.total);
		expect(netPay.nationalInsurance.total).toBe(none.nationalInsurance.total);
		expect(sacrifice.incomeTax.total).toBe(netPay.incomeTax.total);
		expect(ras.incomeTax.total).toBe(none.incomeTax.total);
		expect(ras.pension?.providerAdds).toBeCloseTo(2000 * 0.2, 2);
	});

	it('pension contributions reduce the taper', () => {
		const base = { gross: 110000, nation: 'england-ni' as const, taxYear: '2026-27', asAt: '2026-11-07' };
		expect(takeHome(base).allowance.allowance).toBe(7570);
		expect(takeHome({ ...base, pension: { type: 'salary-sacrifice', amount: 10000 } }).allowance.allowance).toBe(12570);
		expect(takeHome({ ...base, pension: { type: 'relief-at-source', amount: 10000 } }).allowance.allowance).toBe(12570);
	});

	it('an unknown tax code falls back to the standard code with a note', () => {
		const r = takeHome({ gross: 30000, nation: 'england-ni', taxCode: 'ZZ9', taxYear: '2026-27', asAt: '2026-11-07' });
		expect(r.allowance.recognised).toBe(false);
		expect(r.allowance.allowance).toBe(12570);
		expect(r.warnings.some((w) => w.includes('1257L'))).toBe(true);
	});

	it('a rule that is not yet set is reported, not guessed', () => {
		expect(() => takeHome({ gross: 30000, nation: 'scotland', taxYear: '2027-28', asAt: '2027-04-06' })).toThrow(/Scottish Budget/);
		const r = takeHome({ gross: 30000, nation: 'england-ni', studentLoanPlans: ['plan5'], taxYear: '2027-28', asAt: '2027-04-06' });
		expect(r.warnings.some((w) => w.startsWith('Plan 5'))).toBe(true);
	});

	it('effectiveFrom values fall back to the previous value before their date', () => {
		const y = getYear('2026-27');
		const leaf = y.isa!.lifetimeIsa!.firstHomeOverCapCharge;
		expect(leaf.effectiveFrom).toBe('2026-10-29');
		expect(leaf.previous?.value).toBe(0.25);
	});

	it('the marginal rate in the 60% band is 60% plus NI', () => {
		const r = takeHome({ gross: 110000, nation: 'england-ni', taxYear: '2026-27', asAt: '2026-11-07' });
		expect(r.marginalRate).toBeCloseTo(0.62, 2);
	});
});
