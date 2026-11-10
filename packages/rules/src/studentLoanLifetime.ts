// A lifetime model of an income contingent student loan: the balance year by
// year from the April repayments first fall due until it reaches zero or the
// write-off year. Pure and deterministic. The repayment threshold and rate
// come from the rules file for the starting year; everything about the
// future (pay growth, threshold growth, RPI, the interest rule, the term) is
// an explicit input, so a page states its assumptions rather than hiding them.
//
// Each year: the repayment is the plan rate on pay above the threshold,
// rounded down to a whole pound as studentLoan.ts does, and taken in twelve
// equal monthly instalments; interest is added monthly at one twelfth of the
// year's annual rate on the running balance, which is how gov.uk describes
// interest being applied. The year's interest rate is set from that year's
// pay against the interest thresholds (Plan 2) or is a flat rate (other plans).

import { floorPound, round2 } from './rounding.ts';
import type { Plan } from './types.ts';

export interface InterestRule {
	/** The RPI figure the rate is built on, as a rate (0.041 for 4.1%), assumed to hold for every year. */
	rpi: number;
	/** The most added above RPI, reached at or above `upperIncome` (0.03 for Plan 2). Zero for a plan charged RPI only. */
	extraMax: number;
	/** Pay at or below which the rate is RPI only, in the starting year. Null means the repayment threshold. */
	lowerIncome: number | null;
	/** Pay at or above which the rate is RPI plus `extraMax`, in the starting year. Null when `extraMax` is zero. */
	upperIncome: number | null;
	/** A cap on the rate and the number of model years, from the first, it applies for. Null for no cap. */
	cap: { rate: number; years: number } | null;
}

export interface LifetimeInput {
	plan: Plan;
	/** Balance owed at the April repayments first fall due. */
	balance: number;
	/** Pay in the first year of repayment. */
	salary: number;
	/** The plan's repayment threshold in the starting year, from the rules file. */
	threshold: number;
	/** The plan's repayment rate, from the rules file. */
	rate: number;
	/** Pay growth each April, as a rate. */
	earningsGrowth: number;
	/** Threshold growth each April once any freeze ends, as a rate. The interest thresholds move with it. */
	thresholdGrowth: number;
	/** Model years, from the first, during which the threshold stays where it starts. */
	thresholdFrozenYears: number;
	interest: InterestRule;
	/** Years after the April repayments first fall due at which what is left is written off. */
	writeOffYears: number;
	/** The tax year of the first model year, such as "2026-27", used to label the years. */
	startYear: string;
}

export interface LifetimeYear {
	/** 1 for the first year of repayment. */
	year: number;
	taxYear: string;
	salary: number;
	threshold: number;
	/** The annual interest rate applied through the year. */
	interestRate: number;
	opening: number;
	interest: number;
	repaid: number;
	closing: number;
}

export interface LifetimeResult {
	input: LifetimeInput;
	years: LifetimeYear[];
	totalRepaid: number;
	totalInterest: number;
	/** The model year the balance reached zero, or null when it never did. */
	clearedInYear: number | null;
	clearedInTaxYear: string | null;
	writtenOff: boolean;
	/** The balance written off at the end of the term; zero when the loan was cleared. */
	writtenOffBalance: number;
	/** What the balance would have been with no repayments at all, for the page's comparison. */
	interestOnlyBalance: number;
}

/** The tax year `n` years after `startYear`: "2026-27" plus 1 is "2027-28". */
export function taxYearAfter(startYear: string, n: number): string {
	const first = Number(startYear.slice(0, 4)) + n;
	return `${first}-${String((first + 1) % 100).padStart(2, '0')}`;
}

/**
 * The annual interest rate for a year's pay: RPI at or below the lower
 * threshold, RPI plus the maximum extra at or above the upper one, and the
 * same share of the extra as pay's share of the gap in between, as the Plan 2
 * interest page sets out. Capped when a cap is given.
 */
export function lifetimeInterestRate(salary: number, lower: number, upper: number | null, rule: InterestRule, cap: number | null = null): number {
	let extra = 0;
	if (rule.extraMax > 0 && upper !== null && upper > lower) {
		const share = Math.min(1, Math.max(0, (salary - lower) / (upper - lower)));
		extra = rule.extraMax * share;
	}
	const rate = rule.rpi + extra;
	return cap === null ? rate : Math.min(rate, cap);
}

const MONTHS = 12;

export function studentLoanLifetime(input: LifetimeInput): LifetimeResult {
	if (!(input.writeOffYears > 0)) throw new Error('writeOffYears must be a positive number of years');
	if (!(input.balance >= 0)) throw new Error('balance must not be negative');
	const years: LifetimeYear[] = [];
	let balance = input.balance;
	let interestOnly = input.balance;
	let salary = input.salary;
	let threshold = input.threshold;
	const lower0 = input.interest.lowerIncome ?? input.threshold;
	const upper0 = input.interest.upperIncome;
	let totalRepaid = 0;
	let totalInterest = 0;
	let clearedInYear: number | null = null;

	for (let y = 1; y <= input.writeOffYears; y++) {
		if (y > 1) {
			salary *= 1 + input.earningsGrowth;
			if (y > input.thresholdFrozenYears) threshold *= 1 + input.thresholdGrowth;
		}
		// The interest thresholds move with the repayment threshold.
		const scale = threshold / input.threshold;
		const lower = lower0 * scale;
		const upper = upper0 === null ? null : upper0 * scale;
		const cap = input.interest.cap && y <= input.interest.cap.years ? input.interest.cap.rate : null;
		const rate = lifetimeInterestRate(salary, lower, upper, input.interest, cap);
		const annualRepayment = floorPound(Math.max(0, salary - threshold) * input.rate);
		const monthly = annualRepayment / MONTHS;
		const opening = balance;
		let interest = 0;
		let repaid = 0;
		for (let m = 0; m < MONTHS && balance > 0; m++) {
			const added = (balance * rate) / MONTHS;
			balance += added;
			interest += added;
			const paid = Math.min(balance, monthly);
			balance -= paid;
			repaid += paid;
		}
		if (balance < 0.005) balance = 0;
		interestOnly *= (1 + rate / MONTHS) ** MONTHS;
		totalRepaid += repaid;
		totalInterest += interest;
		years.push({ year: y, taxYear: taxYearAfter(input.startYear, y - 1), salary: round2(salary), threshold: round2(threshold), interestRate: rate, opening: round2(opening), interest: round2(interest), repaid: round2(repaid), closing: round2(balance) });
		if (balance === 0) {
			clearedInYear = y;
			break;
		}
	}

	return {
		input,
		years,
		totalRepaid: round2(totalRepaid),
		totalInterest: round2(totalInterest),
		clearedInYear,
		clearedInTaxYear: clearedInYear === null ? null : taxYearAfter(input.startYear, clearedInYear - 1),
		writtenOff: clearedInYear === null,
		writtenOffBalance: clearedInYear === null ? round2(balance) : 0,
		interestOnlyBalance: round2(interestOnly),
	};
}

/**
 * The pay in the first year at which the year's repayment matches the year's
 * interest, so the balance neither grows nor falls: found by bisection
 * between the threshold and a high salary, since the repayment rises with
 * pay faster than the interest does. Null when no such pay exists below `max`.
 */
export function breakEvenSalary(input: Omit<LifetimeInput, 'salary'>, max = 500000): number | null {
	const net = (salary: number) => {
		const r = studentLoanLifetime({ ...input, salary, writeOffYears: 1 });
		return r.years[0].repaid - r.years[0].interest;
	};
	let lo = input.threshold;
	let hi = max;
	if (net(hi) < 0) return null;
	if (net(lo) >= 0) return lo;
	for (let i = 0; i < 60 && hi - lo > 0.5; i++) {
		const mid = (lo + hi) / 2;
		if (net(mid) < 0) lo = mid;
		else hi = mid;
	}
	return Math.ceil(hi);
}
