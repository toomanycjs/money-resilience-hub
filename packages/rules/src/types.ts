// Shapes shared by the config files, the functions and the site.
// A config file is plain JSON; these types describe the parts the
// functions read. Anything else in the file is kept for the rates pages.

export type Nation = 'england-ni' | 'scotland' | 'wales';
export const NATIONS: Nation[] = ['england-ni', 'scotland', 'wales'];
export const NATION_LABEL: Record<Nation, string> = {
	'england-ni': 'England and Northern Ireland',
	scotland: 'Scotland',
	wales: 'Wales',
};

export type Plan = 'plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgraduate';
export const PLANS: Plan[] = ['plan1', 'plan2', 'plan4', 'plan5', 'postgraduate'];
export const PLAN_LABEL: Record<Plan, string> = {
	plan1: 'Plan 1',
	plan2: 'Plan 2',
	plan4: 'Plan 4',
	plan5: 'Plan 5',
	postgraduate: 'Postgraduate loan',
};

export type PensionType = 'relief-at-source' | 'net-pay' | 'salary-sacrifice';
export const PENSION_LABEL: Record<PensionType, string> = {
	'relief-at-source': 'Relief at source',
	'net-pay': 'Net pay',
	'salary-sacrifice': 'Salary sacrifice',
};

/** How sure the figure is. Pages show it wherever a figure appears. */
export type Status = 'in-force' | 'legislated' | 'announced' | 'unset';
export const STATUS_LABEL: Record<Status, string> = {
	'in-force': 'In force',
	legislated: 'Legislated',
	announced: 'Announced',
	unset: 'Not yet set',
};

/** Every value in a config file carries where it came from and when it was checked. */
export interface Leaf<T = number> {
	value: T | null;
	source: string;
	verified: string;
	status: Status;
	note?: string;
	/** The value applies from this date; before it, `previous` applies. */
	effectiveFrom?: string;
	previous?: Leaf<T>;
	/** Path of the archived copy of the source page, relative to packages/rules. */
	archived?: string;
}

export interface Band {
	name: string;
	/** Top of the band in taxable income (after the allowance); null for the last band. */
	upTo: number | null;
	rate: number | null;
	source: string;
	verified: string;
	status: Status;
	note?: string;
	archived?: string;
}

export interface Provenance {
	source: string;
	verified: string;
	status: Status;
	note?: string;
}

export interface ScheduledChange {
	date: string;
	summary: string;
	source: string;
	verified: string;
	status: Status;
}

export interface YearConfig {
	taxYear: string;
	label: string;
	starts: string;
	ends: string;
	nextScheduledChange: ScheduledChange;
	incomeTax: {
		personalAllowance: Leaf;
		taperStart: Leaf;
		taperRate: Leaf;
		marriageAllowanceTransfer: Leaf;
		bands: Record<Nation, Band[]>;
		savings: {
			startingRateLimit: Leaf;
			startingRateIncomeCeiling: Leaf;
			personalSavingsAllowance: { basic: Leaf; higher: Leaf; additional: Leaf };
			rates: { basic: Leaf; higher: Leaf; additional: Leaf };
		};
		property: { rates: { basic: Leaf; higher: Leaf; additional: Leaf }; scotlandRates?: Leaf<unknown> };
		dividends: { allowance: Leaf; rates: { basic: Leaf; higher: Leaf; additional: Leaf } };
		tradingAllowance: Leaf;
	};
	nationalInsurance: {
		employee: { mainRate: Leaf; upperRate: Leaf; lowerEarningsLimit: Leaf; primaryThreshold: Leaf; upperEarningsLimit: Leaf };
		employer: { rate: Leaf; secondaryThreshold: Leaf; employmentAllowance: Leaf };
		selfEmployed: { class2Weekly: Leaf; smallProfitsThreshold: Leaf; class4: { lowerProfitsLimit: Leaf; upperProfitsLimit: Leaf; mainRate: Leaf; upperRate: Leaf } };
	};
	studentLoans: Record<Plan, { threshold: Leaf; rate: Leaf }>;
	childBenefit: { chargeFrom: Leaf; chargeTo: Leaf; chargeStep: Leaf; weeklyEldest: Leaf; weeklyAdditional: Leaf };
	statutoryPay: { ssp: { weekly: Leaf; earningsFraction: Leaf; maxWeeks: Leaf }; smp?: { weekly: Leaf; earningsFraction: Leaf; fullRateWeeks: Leaf } };
	minimumWage?: { effectiveFrom: string; age21AndOver: Leaf; age18To20: Leaf; under18: Leaf; apprentice: Leaf };
	mileage?: { carFirstRate: Leaf; carFirstMiles: Leaf; carAfterRate: Leaf; motorcycle?: Leaf; cycle?: Leaf };
	isa?: { annualLimit: Leaf; cashLimit?: Leaf; lifetimeIsa?: { propertyCap: Leaf; withdrawalCharge: Leaf; firstHomeOverCapCharge: Leaf } };
	pensionTaxAllowance: null | { effectiveFrom: string; fullNewStatePension: Leaf; rate: Leaf; taperDivisor: Leaf; lastYear: Leaf<string> };
}

export interface PensionInput {
	type: PensionType;
	/** Percentage of gross salary, e.g. 5 for 5%. Used when `amount` is not given. */
	percent?: number;
	/** Annual contribution in pounds, used instead of `percent` when given. */
	amount?: number;
}

export interface TakeHomeInput {
	gross: number;
	nation: Nation;
	taxCode?: string;
	studentLoanPlans?: Plan[];
	pension?: PensionInput | null;
	/** Tax year id such as "2026-27". Defaults to the year containing `asAt`. */
	taxYear?: string;
	/** ISO date the rules are read as at. Defaults to today. */
	asAt?: string;
}

export type LineKind = 'income' | 'allowance' | 'band' | 'deduction' | 'pension' | 'total' | 'info';

/** One row of the ledger: what it is, the rate, the slice it applied to, the amount and its source. */
export interface LedgerLine {
	id: string;
	label: string;
	kind: LineKind;
	rate: number | null;
	slice: number | null;
	amount: number;
	/** -1 for a deduction, +1 for income, 0 for information. */
	sign: -1 | 0 | 1;
	provenance: Provenance | null;
	arithmetic: string;
	note?: string;
}

export interface BandResult {
	name: string;
	rate: number;
	from: number;
	to: number | null;
	slice: number;
	tax: number;
	provenance: Provenance;
}

export interface AllowanceResult {
	code: string;
	normalised: string;
	kind: 'L' | 'M' | 'N' | 'T' | 'K' | 'BR' | 'D0' | 'D1' | 'NT' | '0T';
	recognised: boolean;
	/** Allowance before the taper. */
	fromCode: number;
	/** Allowance after the taper. */
	allowance: number;
	taperedBy: number;
	kAddition: number;
	notes: string[];
}

export interface RulerThreshold {
	id: string;
	/** Short name for the mark on the ruler. */
	label: string;
	/** Noun phrase for a sentence: "the higher rate threshold". */
	phrase: string;
	value: number;
	kind: 'allowance' | 'band' | 'ni' | 'loan' | 'charge' | 'taper';
}

export interface NextThreshold {
	threshold: RulerThreshold;
	distance: number;
	sentence: string;
}

export interface RulesUsed {
	taxYear: string;
	label: string;
	nation: Nation;
	asAt: string;
	/** Earliest and latest verified dates among the values this result used. */
	verifiedFrom: string;
	verifiedTo: string;
	/** Least settled status among the values used. */
	status: Status;
	nextChange: ScheduledChange;
	sources: { source: string; verified: string; status: Status }[];
}

export interface Breakdown {
	taxYear: string;
	label: string;
	nation: Nation;
	asAt: string;
	input: Required<Pick<TakeHomeInput, 'gross' | 'nation' | 'taxCode' | 'studentLoanPlans'>> & { pension: PensionInput | null };
	gross: number;
	/** Pay after salary sacrifice; the figure tax, NI and student loans see unless stated. */
	payAfterSacrifice: number;
	taxableGross: number;
	adjustedNetIncome: number;
	allowance: AllowanceResult;
	taxableIncome: number;
	incomeTax: { total: number; bands: BandResult[]; capped: boolean };
	nationalInsurance: { total: number; bands: BandResult[] };
	studentLoans: { total: number; plans: { plan: Plan; threshold: number; rate: number; slice: number; amount: number; provenance: Provenance }[] };
	pension: null | { type: PensionType; gross: number; fromPay: number; providerAdds: number; taxSaving: number; niSaving: number };
	takeHome: number;
	periods: { annual: number; monthly: number; weekly: number; daily: number };
	effectiveRate: number;
	marginalRate: number | null;
	thresholds: RulerThreshold[];
	nextThreshold: NextThreshold | null;
	lines: LedgerLine[];
	rulesUsed: RulesUsed;
	warnings: string[];
}

export class RulesUnavailableError extends Error {
	readonly path: string;
	constructor(message: string, path: string) {
		super(message);
		this.name = 'RulesUnavailableError';
		this.path = path;
	}
}
