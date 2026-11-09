// Everything a salary page shows is computed here from the engine: the
// breakdown for the page's nation, the other nations, the student loan row
// per plan with its source, a pension scenario per scheme type, what each of
// the next five thousand pounds is worth, the distance to every threshold,
// the FAQ answers and the "facts" the thin-page guard counts.

import { MARGINAL_STEP, NATION_LABEL, NATIONS, PENSION_LABEL, PLAN_LABEL, PLANS, RulesUnavailableError, getYear, grossForTakeHome, studentLoan, takeHome, yearOnYear, type Breakdown, type Nation, type PensionType, type Plan } from '@money-resilience-hub/rules';
import { money, pct } from '@money-resilience-hub/calculators';
import type { FaqPair } from './schema.ts';

/** The pension share used in the scenario rows, as a percentage of salary. */
export const PENSION_SCENARIO_PERCENT = 5;
/** The step and count of the "next few thousand" table. */
export const STEP = 1000;
export const STEPS = 5;

export interface SalaryPageData {
	amount: number;
	nation: Nation;
	breakdown: Breakdown;
	byNation: Record<Nation, Breakdown | null>;
	/** The other set of income tax rates: Scotland on a rest-of-UK page, England and Northern Ireland on a Scottish one. */
	other: Breakdown | null;
	walesMatchesEngland: boolean;
	loanRows: { plan: Plan; label: string; threshold: number; rate: number; amount: number; monthly: number; source: string; verified: string }[];
	pensionRows: { type: PensionType; label: string; intoPension: number; takeHome: number; monthly: number; cost: number; costPerPound: number }[];
	steps: { amount: number; takeHome: number; extra: number; extraMonthly: number; kept: number }[];
	thresholdRows: { id: string; label: string; value: number; distance: number }[];
	faqs: FaqPair[];
	facts: string[];
	/** Figures the guard compares with a margin. */
	numbers: Record<string, number>;
}

const WHERE: Record<Nation, string> = { 'england-ni': 'England or Northern Ireland', scotland: 'Scotland', wales: 'Wales' };

export function salaryPage(amount: number, asAt: string, nation: Nation = 'england-ni', taxYear?: string): SalaryPageData {
	const base = { gross: amount, nation, asAt, taxYear };
	const breakdown = takeHome(base);
	const byNation = Object.fromEntries(
		NATIONS.map((n) => {
			try {
				return [n, n === nation ? breakdown : takeHome({ ...base, nation: n })];
			} catch (e) {
				if (e instanceof RulesUnavailableError) return [n, null];
				throw e;
			}
		}),
	) as Record<Nation, Breakdown | null>;
	const other = nation === 'scotland' ? byNation['england-ni'] : byNation.scotland;
	const walesMatchesEngland = !!byNation.wales && !!byNation['england-ni'] && byNation.wales.takeHome === byNation['england-ni'].takeHome;

	const year = getYear(breakdown.taxYear);
	const loanRows = PLANS.flatMap((plan) => {
		try {
			const r = studentLoan(amount, plan, year, asAt);
			return [{ plan, label: PLAN_LABEL[plan], threshold: r.threshold, rate: r.rate, amount: r.amount, monthly: Math.round((r.amount / 12) * 100) / 100, source: r.provenance.source, verified: r.provenance.verified }];
		} catch {
			return [];
		}
	});

	const pensionRows = (Object.keys(PENSION_LABEL) as PensionType[]).flatMap((type) => {
		const b = takeHome({ ...base, pension: { type, percent: PENSION_SCENARIO_PERCENT } }, { withMarginal: false });
		if (!b.pension) return [];
		const cost = Math.round((breakdown.takeHome - b.takeHome) * 100) / 100;
		return [{ type, label: PENSION_LABEL[type], intoPension: b.pension.gross, takeHome: b.takeHome, monthly: b.periods.monthly, cost, costPerPound: b.pension.gross > 0 ? cost / b.pension.gross : 0 }];
	});

	const steps = Array.from({ length: STEPS }, (_, i) => {
		const more = (i + 1) * STEP;
		const b = takeHome({ ...base, gross: amount + more }, { withMarginal: false });
		const extra = Math.round((b.takeHome - breakdown.takeHome) * 100) / 100;
		return { amount: amount + more, takeHome: b.takeHome, extra, extraMonthly: Math.round((extra / 12) * 100) / 100, kept: extra / more };
	});

	const thresholdRows = breakdown.thresholds.map((t) => ({ id: t.id, label: t.label, value: t.value, distance: Math.round((t.value - amount) * 100) / 100 }));

	const yoy = yearOnYear(base);
	const m = breakdown.periods;
	const faqs: FaqPair[] = [
		{
			q: `How much is ${money(amount, 0)} a month after tax${nation === 'scotland' ? ' in Scotland' : ''}?`,
			a: `${money(m.monthly, 0)} a month in ${breakdown.label} for someone in ${WHERE[nation]} with the standard tax code and no student loan or pension, which is ${money(m.annual, 0)} a year or ${money(m.weekly, 0)} a week.`,
		},
		{
			q: `How much tax do you pay on ${money(amount, 0)}${nation === 'scotland' ? ' in Scotland' : ''}?`,
			a: `${money(breakdown.incomeTax.total, 0)} of income tax and ${money(breakdown.nationalInsurance.total, 0)} of National Insurance a year, so ${money(breakdown.incomeTax.total + breakdown.nationalInsurance.total, 0)} in all, an effective rate of ${pct(breakdown.effectiveRate)}.`,
		},
		{
			q: `What is the marginal tax rate at ${money(amount, 0)}${nation === 'scotland' ? ' in Scotland' : ''}?`,
			a: `${pct(breakdown.marginalRate ?? 0)}. That is the share of the next ${money(MARGINAL_STEP, 0)} that goes in tax and National Insurance. ${breakdown.nextThreshold?.sentence ?? ''}`.trim(),
		},
	];
	if (other) {
		const elsewhere = nation === 'scotland' ? 'England, Wales and Northern Ireland' : 'Scotland';
		faqs.push({
			q: nation === 'scotland' ? `How does ${money(amount, 0)} in Scotland compare with the rest of the UK?` : `How much is ${money(amount, 0)} after tax in Scotland?`,
			a:
				nation === 'scotland'
					? `In ${elsewhere} the same salary gives ${money(other.periods.monthly, 0)} a month, ${money(other.periods.annual, 0)} a year. The Scottish result is ${describeDifference(breakdown.takeHome - other.takeHome)}. National Insurance is the same; only income tax differs.`
					: `${money(other.periods.monthly, 0)} a month, ${money(other.periods.annual, 0)} a year, under the Scottish rates for ${breakdown.label}. That is ${describeDifference(other.takeHome - breakdown.takeHome)} than in England and Northern Ireland.`,
		});
	}
	if (loanRows.length) {
		faqs.push({
			q: `How much student loan do you repay on ${money(amount, 0)}?`,
			a: loanRows.map((r) => `${r.label}: ${money(r.amount, 0)} a year`).join('; ') + '. Each plan repays a fixed share of pay above its own threshold, so the plan matters more than the loan size.',
		});
	}
	const sacrifice = pensionRows.find((r) => r.type === 'salary-sacrifice');
	if (sacrifice) {
		faqs.push({
			q: `What does a ${PENSION_SCENARIO_PERCENT}% pension cost on ${money(amount, 0)}?`,
			a: `By salary sacrifice, ${money(sacrifice.intoPension, 0)} a year goes into the pension and take-home falls by ${money(sacrifice.cost, 0)}, to ${money(sacrifice.monthly, 0)} a month. Each pound in the pension costs ${Math.round(sacrifice.costPerPound * 100)}p of take-home, because the sacrificed pay is not taxed and carries no National Insurance.`,
		});
	}

	const facts = [
		`monthly:${m.monthly}`,
		`bands:${breakdown.incomeTax.bands.filter((b) => b.slice > 0).map((b) => b.name).join('+')}`,
		`marginal:${breakdown.marginalRate}`,
		`next:${breakdown.nextThreshold?.threshold.id ?? 'none'}`,
		`taper:${breakdown.allowance.taperedBy > 0}`,
		`allowance:${breakdown.allowance.allowance}`,
		`loans:${loanRows.filter((r) => r.amount > 0).map((r) => r.plan).join('+')}`,
		`ni-upper:${breakdown.nationalInsurance.bands.filter((b) => b.slice > 0).length}`,
		`kept:${steps.map((s) => Math.round(s.kept * 100)).join('/')}`,
		`changed:${yoy ? Math.sign(yoy.difference) : 0}`,
	];
	const numbers = {
		monthly: m.monthly,
		tax: breakdown.incomeTax.total,
		ni: breakdown.nationalInsurance.total,
		pension: sacrifice?.cost ?? 0,
	};

	return { amount, nation, breakdown, byNation, other, walesMatchesEngland, loanRows, pensionRows, steps, thresholdRows, faqs, facts, numbers };
}

function describeDifference(d: number): string {
	const abs = Math.abs(Math.round(d));
	if (abs < 1) return 'the same';
	return `${money(abs, 0)} a year ${d > 0 ? 'more' : 'less'}`;
}

/** The salary that gives a monthly take-home, for the monthly pages. */
export function salaryForMonthly(monthly: number, asAt: string, nation: Nation = 'england-ni'): number {
	return grossForTakeHome(monthly * 12, { nation, asAt });
}

/**
 * The thin-page and near-duplicate guard. A page is built only if it carries
 * at least four computed facts beyond the headline and at least two of them
 * differ from each live neighbour: a categorical fact (bands reached, nearest
 * threshold, taper, allowance left, loans repaying, the share of each of the
 * next thousands kept) or a figure that moves by more than its margin
 * (monthly take-home, income tax, National Insurance, the cost of the pension
 * scenario). The margins are set so that pages a thousand pounds apart pass
 * only where the figures on them differ.
 */
export const GUARD_MARGINS: Record<string, number> = { monthly: 40, tax: 150, ni: 50, pension: 25 };

export function guardReport(amounts: number[], asAt: string, nation: Nation = 'england-ni'): { amount: number; ok: boolean; reason?: string }[] {
	const sorted = [...amounts].sort((a, b) => a - b);
	const pages = sorted.map((amount) => salaryPage(amount, asAt, nation));
	const differing = (a: SalaryPageData, b: SalaryPageData) => {
		let n = 0;
		for (const k of Object.keys(GUARD_MARGINS)) if (Math.abs(a.numbers[k] - b.numbers[k]) >= GUARD_MARGINS[k]) n++;
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

const passing = new Map<string, number[]>();
/** The amounts that pass the guard, worked out once per build for each nation. */
export function pagesPassingGuard(amounts: number[], asAt: string, nation: Nation = 'england-ni'): number[] {
	const key = `${nation}:${asAt}:${amounts.join(',')}`;
	if (!passing.has(key)) passing.set(key, guardReport(amounts, asAt, nation).filter((r) => r.ok).map((r) => r.amount));
	return passing.get(key)!;
}

export { NATION_LABEL };
