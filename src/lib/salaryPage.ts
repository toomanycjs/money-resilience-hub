// Everything a salary page shows is computed here from the engine: the
// breakdown per nation, the student loan row per plan, the FAQ answers and the
// "facts" the thin-page guard counts.

import { grossForTakeHome, MARGINAL_STEP, NATION_LABEL, NATIONS, PLAN_LABEL, PLANS, RulesUnavailableError, studentLoan, takeHome, yearOnYear, getYear, type Breakdown, type Nation, type Plan } from '@money-resilience-hub/rules';
import { money, pct } from '@money-resilience-hub/calculators';
import type { FaqPair } from './schema.ts';

export interface SalaryPageData {
	amount: number;
	breakdown: Breakdown;
	byNation: Record<Nation, Breakdown | null>;
	loanRows: { plan: Plan; label: string; threshold: number; amount: number; monthly: number }[];
	whatChanged: string | null;
	faqs: FaqPair[];
	facts: string[];
	nearestHourly: number;
	nearestMonthly: number;
}

export function salaryPage(amount: number, asAt: string, taxYear?: string): SalaryPageData {
	const base = { gross: amount, nation: 'england-ni' as Nation, asAt, taxYear };
	const breakdown = takeHome(base);
	const byNation = Object.fromEntries(
		NATIONS.map((n) => {
			try {
				return [n, takeHome({ ...base, nation: n })];
			} catch (e) {
				if (e instanceof RulesUnavailableError) return [n, null];
				throw e;
			}
		}),
	) as Record<Nation, Breakdown | null>;

	const year = getYear(breakdown.taxYear);
	const loanRows = PLANS.flatMap((plan) => {
		try {
			const r = studentLoan(amount, plan, year, asAt);
			return [{ plan, label: PLAN_LABEL[plan], threshold: r.threshold, amount: r.amount, monthly: Math.round((r.amount / 12) * 100) / 100 }];
		} catch {
			return [];
		}
	});

	const yoy = yearOnYear(base);
	const whatChanged = yoy?.sentence ?? null;

	const m = breakdown.periods;
	const faqs: FaqPair[] = [
		{
			q: `How much is ${money(amount, 0)} a month after tax?`,
			a: `${money(m.monthly, 0)} a month in ${breakdown.label} for someone in England or Northern Ireland with the standard tax code and no student loan or pension, which is ${money(m.annual, 0)} a year or ${money(m.weekly, 0)} a week.`,
		},
		{
			q: `How much tax do you pay on ${money(amount, 0)}?`,
			a: `${money(breakdown.incomeTax.total, 0)} of income tax and ${money(breakdown.nationalInsurance.total, 0)} of National Insurance a year, so ${money(breakdown.incomeTax.total + breakdown.nationalInsurance.total, 0)} in all, an effective rate of ${pct(breakdown.effectiveRate)}.`,
		},
		{
			q: `What is the marginal tax rate at ${money(amount, 0)}?`,
			a: `${pct(breakdown.marginalRate ?? 0)}. That is the share of the next ${money(MARGINAL_STEP, 0)} that goes in tax and National Insurance. ${breakdown.nextThreshold?.sentence ?? ''}`.trim(),
		},
	];
	if (byNation.scotland) {
		faqs.push({
			q: `How much is ${money(amount, 0)} after tax in Scotland?`,
			a: `${money(byNation.scotland.periods.monthly, 0)} a month, ${money(byNation.scotland.periods.annual, 0)} a year, under the Scottish rates for ${breakdown.label}. That is ${describeDifference(byNation.scotland.takeHome - breakdown.takeHome)} than in England and Northern Ireland.`,
		});
	}
	const plan2 = loanRows.find((r) => r.plan === 'plan2');
	if (plan2) {
		faqs.push({
			q: `How much student loan do you repay on ${money(amount, 0)}?`,
			a: loanRows.map((r) => `${r.label}: ${money(r.amount, 0)} a year`).join('; ') + '. Each plan repays a fixed share of pay above its own threshold, so the plan matters more than the loan size.',
		});
	}

	const facts = [
		`monthly:${m.monthly}`,
		`bands:${breakdown.incomeTax.bands.map((b) => b.name).join('+')}`,
		`marginal:${breakdown.marginalRate}`,
		`next:${breakdown.nextThreshold?.threshold.id ?? 'none'}`,
		`taper:${breakdown.allowance.taperedBy > 0}`,
		`loans:${loanRows.filter((r) => r.amount > 0).map((r) => r.plan).join('+')}`,
		`ni-upper:${breakdown.nationalInsurance.bands.length}`,
		`changed:${yoy ? Math.sign(yoy.difference) : 0}`,
	];

	return {
		amount,
		breakdown,
		byNation,
		loanRows,
		whatChanged,
		faqs,
		facts,
		nearestHourly: Math.round((amount / (52 * 37.5)) * 2) / 2,
		nearestMonthly: Math.round(m.monthly / 100) * 100,
	};
}

function describeDifference(d: number): string {
	const abs = Math.abs(Math.round(d));
	if (abs < 1) return 'the same';
	return `${money(abs, 0)} a year ${d > 0 ? 'more' : 'less'}`;
}

/** The salary that gives a monthly take-home, for monthly pages. */
export function salaryForMonthly(monthly: number, asAt: string): number {
	return grossForTakeHome(monthly * 12, { nation: 'england-ni', asAt });
}

/**
 * The thin-page and near-duplicate guard. A page is built only if it carries
 * at least four computed facts beyond the headline and at least two of them
 * differ from each live neighbour: a categorical fact (bands reached, nearest
 * threshold, taper, loans repaying) or a figure that moves by more than the
 * margin (monthly take-home, income tax, National Insurance).
 */
export const GUARD_MARGINS = { monthly: 75, tax: 150, ni: 50 };

export function guardReport(amounts: number[], asAt: string): { amount: number; ok: boolean; reason?: string }[] {
	const sorted = [...amounts].sort((a, b) => a - b);
	const pages = sorted.map((amount) => salaryPage(amount, asAt));
	const numeric = (p: SalaryPageData) => ({ monthly: p.breakdown.periods.monthly, tax: p.breakdown.incomeTax.total, ni: p.breakdown.nationalInsurance.total });
	const differing = (a: SalaryPageData, b: SalaryPageData) => {
		let n = 0;
		const na = numeric(a);
		const nb = numeric(b);
		for (const k of Object.keys(GUARD_MARGINS) as (keyof typeof GUARD_MARGINS)[]) if (Math.abs(na[k] - nb[k]) >= GUARD_MARGINS[k]) n++;
		for (let i = 1; i < a.facts.length; i++) if (a.facts[i] !== b.facts[i]) n++;
		return n;
	};
	return pages.map((p, i) => {
		if (p.facts.length < 5) return { amount: p.amount, ok: false, reason: `only ${p.facts.length - 1} computed facts beyond the headline` };
		for (const j of [i - 1, i + 1]) {
			if (j < 0 || j >= pages.length) continue;
			const d = differing(p, pages[j]);
			if (d < 2) return { amount: p.amount, ok: false, reason: `only ${d} fact(s) differ from the ${money(pages[j].amount, 0)} page` };
		}
		return { amount: p.amount, ok: true };
	});
}

export function pagesPassingGuard(amounts: number[], asAt: string): number[] {
	return guardReport(amounts, asAt).filter((r) => r.ok).map((r) => r.amount);
}

export { NATION_LABEL };
