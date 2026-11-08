// The take-home breakdown: every deduction on its own line with the rate,
// the slice it applied to, the amount and the source it came from.

import { getYear, leastSettled, today, yearFor } from './config.ts';
import { bandsFor, incomeTax, taxableIncome } from './incomeTax.ts';
import { nationalInsurance } from './nationalInsurance.ts';
import { round2 } from './rounding.ts';
import { studentLoan } from './studentLoan.ts';
import { parseTaxCode, taperAllowance } from './taxCode.ts';
import { nextThresholdFor, thresholdsFor } from './thresholds.ts';
import {
	PENSION_LABEL,
	PLAN_LABEL,
	RulesUnavailableError,
	type Breakdown,
	type LedgerLine,
	type Plan,
	type Provenance,
	type Status,
	type TakeHomeInput,
	type YearConfig,
} from './types.ts';

/** The marginal rate is measured over the next £1,000 of pay. */
export const MARGINAL_STEP = 1000;

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

function pensionAmounts(input: TakeHomeInput): number {
	if (!input.pension) return 0;
	if (input.pension.amount != null) return round2(Math.max(0, input.pension.amount));
	return round2(Math.max(0, input.gross * ((input.pension.percent ?? 0) / 100)));
}

export function takeHome(input: TakeHomeInput, options: { withMarginal?: boolean } = {}): Breakdown {
	const asAt = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(asAt);
	const gross = Math.max(0, round2(input.gross || 0));
	const plans = (input.studentLoanPlans ?? []).filter((p, i, a) => a.indexOf(p) === i) as Plan[];
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];
	const used: Provenance[] = [];
	const use = (p: Provenance | null | undefined) => {
		if (p) used.push(p);
		return p ?? null;
	};

	// Pension: what comes out of pay, and what tax and NI see.
	const contribution = pensionAmounts(input);
	const pensionType = input.pension?.type ?? null;
	const payAfterSacrifice = pensionType === 'salary-sacrifice' ? round2(gross - contribution) : gross;
	const taxableGross = pensionType === 'net-pay' ? round2(gross - contribution) : payAfterSacrifice;
	const extendBy = pensionType === 'relief-at-source' ? contribution : 0;
	// Adjusted net income for the taper: pay less gross pension contributions.
	const adjustedNetIncome = Math.max(0, round2(taxableGross - extendBy));

	// Allowance from the tax code, then the taper.
	const parsed = parseTaxCode(input.taxCode, year, input.nation, asAt);
	const allowance = taperAllowance(parsed, adjustedNetIncome, year, asAt);
	for (const n of allowance.notes) warnings.push(n);

	lines.push({
		id: 'gross',
		label: pensionType === 'salary-sacrifice' ? 'Salary before sacrifice' : 'Salary',
		kind: 'income',
		rate: null,
		slice: null,
		amount: gross,
		sign: 1,
		provenance: null,
		arithmetic: `Gross annual pay ${money(gross)}.`,
	});

	if (pensionType === 'salary-sacrifice' && contribution > 0) {
		lines.push({
			id: 'sacrifice',
			label: 'Salary sacrifice pension',
			kind: 'pension',
			rate: input.pension?.percent != null ? input.pension.percent / 100 : null,
			slice: gross,
			amount: contribution,
			sign: -1,
			provenance: null,
			arithmetic: `${money(gross)} × ${pct((contribution / gross) || 0)} = ${money(contribution)}, given up before tax and National Insurance are worked out.`,
		});
	}
	if (pensionType === 'net-pay' && contribution > 0) {
		lines.push({
			id: 'net-pay-pension',
			label: 'Pension (net pay)',
			kind: 'pension',
			rate: input.pension?.percent != null ? input.pension.percent / 100 : null,
			slice: gross,
			amount: contribution,
			sign: -1,
			provenance: null,
			arithmetic: `${money(contribution)} taken from pay before income tax. National Insurance and student loan deductions still use the full ${money(gross)}.`,
		});
	}

	// Personal allowance line.
	const paProv = use({ source: year.incomeTax.personalAllowance.source, verified: year.incomeTax.personalAllowance.verified, status: year.incomeTax.personalAllowance.status });
	if (allowance.kind === 'K') {
		lines.push({
			id: 'k-code',
			label: `Tax code ${allowance.normalised}: added to taxable pay`,
			kind: 'allowance',
			rate: null,
			slice: null,
			amount: allowance.kAddition,
			sign: 0,
			provenance: paProv,
			arithmetic: `A K code means untaxed income exceeds your allowance. The code number × 10 = ${money(allowance.kAddition)} is added to taxable pay. Tax is capped at half of pay.`,
		});
	} else if (['BR', 'D0', 'D1', 'NT', '0T'].includes(allowance.kind)) {
		lines.push({
			id: 'allowance',
			label: `Tax code ${allowance.normalised}: no personal allowance`,
			kind: 'allowance',
			rate: null,
			slice: null,
			amount: 0,
			sign: 0,
			provenance: paProv,
			arithmetic: allowance.kind === 'NT' ? 'NT means no tax is taken from this pay.' : `${allowance.kind} gives no allowance on this pay. It is usually used for a second job or pension.`,
		});
	} else {
		const taperStart = year.incomeTax.taperStart.value ?? 0;
		lines.push({
			id: 'allowance',
			label: allowance.taperedBy > 0 ? 'Personal allowance (reduced above £100,000)'.replace('£100,000', money(taperStart).replace('.00', '')) : 'Personal allowance',
			kind: 'allowance',
			rate: null,
			slice: null,
			amount: allowance.allowance,
			sign: 0,
			provenance: allowance.taperedBy > 0 ? use({ source: year.incomeTax.taperStart.source, verified: year.incomeTax.taperStart.verified, status: year.incomeTax.taperStart.status }) : paProv,
			arithmetic:
				allowance.taperedBy > 0
					? `Tax code ${allowance.normalised} gives ${money(allowance.fromCode)}. Adjusted net income ${money(adjustedNetIncome)} is ${money(adjustedNetIncome - taperStart)} above ${money(taperStart)}, so the allowance falls by half of that, ${money(allowance.taperedBy)}, to ${money(allowance.allowance)}.`
					: `Tax code ${allowance.normalised} gives an allowance of ${money(allowance.allowance)}, taxed at 0%.`,
		});
	}

	// Income tax.
	const taxable = allowance.kind === 'NT' ? 0 : taxableIncome(taxableGross, allowance);
	const flatBand = (['BR', 'D0', 'D1'] as const).find((k) => k === allowance.kind);
	const tax = allowance.kind === 'NT' ? { total: 0, bands: [], capped: false } : incomeTax(taxable, input.nation, year, { flatBand, extendBy, capAt: allowance.kind === 'K' ? round2(taxableGross * 0.5) : null });
	for (const b of tax.bands) {
		use(b.provenance);
		lines.push({
			id: `tax-${b.name.toLowerCase().replace(/\s+/g, '-')}`,
			label: `Income tax: ${b.name.toLowerCase()}`,
			kind: 'band',
			rate: b.rate,
			slice: b.slice,
			amount: b.tax,
			sign: -1,
			provenance: b.provenance,
			arithmetic: flatBand
				? `All ${money(b.slice)} of taxable pay at ${pct(b.rate)} = ${money(b.tax)}.`
				: `Taxable income from ${money(b.from)} to ${b.to === null ? 'the top' : money(b.to)}: ${money(b.slice)} × ${pct(b.rate)} = ${money(b.tax)}.`,
		});
	}
	if (tax.capped) {
		lines.push({ id: 'k-cap', label: 'K code cap: tax limited to half of pay', kind: 'info', rate: null, slice: null, amount: tax.total, sign: 0, provenance: paProv, arithmetic: `Tax on a K code cannot exceed 50% of pay: ${money(round2(taxableGross * 0.5))}.` });
	}

	// National Insurance on pay after sacrifice.
	const ni = nationalInsurance(payAfterSacrifice, year, asAt);
	for (const b of ni.bands) {
		use(b.provenance);
		lines.push({
			id: `ni-${b.from}`,
			label: b.name === 'Main rate' ? 'National Insurance' : 'National Insurance above the upper earnings limit',
			kind: 'deduction',
			rate: b.rate,
			slice: b.slice,
			amount: b.tax,
			sign: -1,
			provenance: b.provenance,
			arithmetic: `Earnings from ${money(b.from)} to ${b.to === null ? 'the top' : money(b.to)}: ${money(b.slice)} × ${pct(b.rate)} = ${money(b.tax)}.`,
		});
	}

	// Student loans on pay after sacrifice (net pay pensions do not reduce it).
	const loans: Breakdown['studentLoans']['plans'] = [];
	for (const plan of plans) {
		try {
			const r = studentLoan(payAfterSacrifice, plan, year, asAt);
			use(r.provenance);
			loans.push(r);
			lines.push({
				id: `loan-${plan}`,
				label: `Student loan (${PLAN_LABEL[plan]})`,
				kind: 'deduction',
				rate: r.rate,
				slice: r.slice,
				amount: r.amount,
				sign: -1,
				provenance: r.provenance,
				arithmetic: r.slice > 0 ? `Pay above the ${PLAN_LABEL[plan]} threshold of ${money(r.threshold)}: ${money(r.slice)} × ${pct(r.rate)} = ${money(r.amount)}, rounded down to a pound.` : `Pay is at or below the ${PLAN_LABEL[plan]} threshold of ${money(r.threshold)}, so nothing is repaid.`,
			});
		} catch (e) {
			if (e instanceof RulesUnavailableError) warnings.push(`${PLAN_LABEL[plan]} for ${year.label} is not yet set: ${e.message.replace(/^.*?: /, '')}`);
			else throw e;
		}
	}
	const loanTotal = loans.reduce((s, l) => s + l.amount, 0);

	// Relief at source: the deduction from pay is the net contribution.
	let pension: Breakdown['pension'] = null;
	if (pensionType && contribution > 0) {
		const basicRate = (bandsFor(year, input.nation).find((b) => b.name === 'Basic rate')?.rate as number) ?? 0.2;
		const fromPay = pensionType === 'relief-at-source' ? round2(contribution * (1 - basicRate)) : contribution;
		const providerAdds = pensionType === 'relief-at-source' ? round2(contribution - fromPay) : 0;
		const without = takeHome({ ...input, pension: null, asAt, taxYear: year.taxYear }, { withMarginal: false });
		const niSaving = round2(without.nationalInsurance.total - ni.total);
		const taxSaving = round2(without.incomeTax.total - tax.total + providerAdds);
		pension = { type: pensionType, gross: contribution, fromPay, providerAdds, taxSaving, niSaving };
		if (pensionType === 'relief-at-source') {
			lines.push({
				id: 'ras-pension',
				label: 'Pension (relief at source)',
				kind: 'pension',
				rate: input.pension?.percent != null ? input.pension.percent / 100 : null,
				slice: gross,
				amount: fromPay,
				sign: -1,
				provenance: null,
				arithmetic: `A ${money(contribution)} contribution costs ${money(fromPay)} from pay; your provider claims ${money(providerAdds)} basic rate relief. Any higher rate relief is shown through the wider basic rate band above.`,
			});
		}
	}

	const deductions = round2(tax.total + ni.total + loanTotal + (pension ? (pensionType === 'salary-sacrifice' ? contribution : pension.fromPay) : 0));
	const net = round2(gross - deductions);
	lines.push({ id: 'take-home', label: 'Take-home pay', kind: 'total', rate: null, slice: null, amount: net, sign: 1, provenance: null, arithmetic: `${money(gross)} − ${money(deductions)} = ${money(net)}.` });

	const thresholds = thresholdsFor(year, input.nation, plans, asAt, allowance.allowance);
	const nextThreshold = nextThresholdFor(thresholds, payAfterSacrifice);

	const verifiedDates = used.map((p) => p.verified).filter(Boolean).sort();
	const rulesUsed: Breakdown['rulesUsed'] = {
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		verifiedFrom: verifiedDates[0] ?? '',
		verifiedTo: verifiedDates[verifiedDates.length - 1] ?? '',
		status: leastSettled(used.map((p) => p.status as Status)),
		nextChange: year.nextScheduledChange,
		sources: dedupe(used),
	};

	const breakdown: Breakdown = {
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		input: { gross, nation: input.nation, taxCode: input.taxCode ?? allowance.normalised, studentLoanPlans: plans, pension: input.pension ?? null },
		gross,
		payAfterSacrifice,
		taxableGross,
		adjustedNetIncome,
		allowance,
		taxableIncome: taxable,
		incomeTax: tax,
		nationalInsurance: ni,
		studentLoans: { total: loanTotal, plans: loans },
		pension,
		takeHome: net,
		periods: { annual: net, monthly: round2(net / 12), weekly: round2(net / 52), daily: round2(net / 260) },
		effectiveRate: gross > 0 ? round2(deductions / gross * 100) / 100 : 0,
		marginalRate: null,
		thresholds,
		nextThreshold,
		lines,
		rulesUsed,
		warnings,
	};

	if (options.withMarginal !== false) {
		const step = MARGINAL_STEP;
		const up = takeHome({ ...input, gross: gross + step, asAt, taxYear: year.taxYear }, { withMarginal: false });
		breakdown.marginalRate = round2(1 - (up.takeHome - net) / step);
	}
	return breakdown;
}

function dedupe(list: Provenance[]): { source: string; verified: string; status: Status }[] {
	const seen = new Map<string, { source: string; verified: string; status: Status }>();
	for (const p of list) if (p.source && !seen.has(p.source)) seen.set(p.source, { source: p.source, verified: p.verified, status: p.status });
	return [...seen.values()];
}

/** The gross salary that gives a target annual take-home, by bisection. */
export function grossForTakeHome(targetAnnual: number, base: Omit<TakeHomeInput, 'gross'>): number {
	let lo = 0;
	let hi = Math.max(targetAnnual * 3, 10000);
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		const r = takeHome({ ...base, gross: mid }, { withMarginal: false });
		if (r.takeHome < targetAnnual) lo = mid;
		else hi = mid;
	}
	return Math.round(hi);
}

export { PENSION_LABEL };
