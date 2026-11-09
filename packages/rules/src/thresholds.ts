// Thresholds on the gross-income scale, for the ruler and the sentence under it.

import { resolve } from './config.ts';
import { bandsFor } from './incomeTax.ts';
import { round2 } from './rounding.ts';
import { PLAN_LABEL, type Nation, type NextThreshold, type Plan, type RulerThreshold, type YearConfig } from './types.ts';

const money = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

/**
 * Every threshold that matters at this income: the allowance, each band start
 * in gross terms, the NI upper earnings limit, the child benefit charge, the
 * taper and the selected student loan plans.
 */
export function thresholdsFor(year: YearConfig, nation: Nation, plans: Plan[], asAt: string, allowance?: number): RulerThreshold[] {
	const pa = allowance ?? resolve(year.incomeTax.personalAllowance, 'incomeTax.personalAllowance', asAt).value;
	const standardPa = resolve(year.incomeTax.personalAllowance, 'incomeTax.personalAllowance', asAt).value;
	const out: RulerThreshold[] = [];
	out.push({ id: 'allowance', label: 'Personal allowance', phrase: 'the top of your personal allowance', value: pa, kind: 'allowance' });

	let bands: ReturnType<typeof bandsFor> = [];
	try {
		bands = bandsFor(year, nation);
	} catch {
		bands = [];
	}
	// A band top is in taxable income. The gross pay at which it is reached
	// depends on the allowance at that pay, which tapers above £100,000:
	// solve g - allowance(g) = top.
	let taperStart = Infinity;
	let taperRate = 0.5;
	try {
		taperStart = resolve(year.incomeTax.taperStart, 'incomeTax.taperStart', asAt).value;
		taperRate = resolve(year.incomeTax.taperRate, 'incomeTax.taperRate', asAt).value;
	} catch {
		/* no taper recorded */
	}
	const grossFor = (top: number): number => {
		if (top + standardPa <= taperStart) return top + standardPa;
		const g = (top + standardPa + taperStart * taperRate) / (1 + taperRate);
		return g >= taperStart + standardPa / taperRate ? top : Math.round(g);
	};
	let lower = 0;
	for (const b of bands) {
		if (lower > 0) out.push({ id: `band-${b.name.toLowerCase().replace(/\s+/g, '-')}`, label: b.name, phrase: `the ${b.name.toLowerCase()} threshold`, value: grossFor(lower), kind: 'band' });
		if (b.upTo === null) break;
		lower = b.upTo;
	}

	try {
		const uel = resolve(year.nationalInsurance.employee.upperEarningsLimit, 'nationalInsurance.employee.upperEarningsLimit', asAt).value;
		out.push({ id: 'ni-uel', label: 'NI upper earnings limit', phrase: 'the National Insurance upper earnings limit', value: uel, kind: 'ni' });
	} catch {
		/* not set */
	}
	try {
		const from = resolve(year.childBenefit.chargeFrom, 'childBenefit.chargeFrom', asAt).value;
		out.push({ id: 'child-benefit', label: 'Child benefit charge', phrase: 'the start of the child benefit charge', value: from, kind: 'charge' });
	} catch {
		/* not set */
	}
	try {
		const start = resolve(year.incomeTax.taperStart, 'incomeTax.taperStart', asAt).value;
		const rate = resolve(year.incomeTax.taperRate, 'incomeTax.taperRate', asAt).value;
		out.push({ id: 'taper', label: 'Allowance taper', phrase: 'the point where your allowance starts to taper', value: start, kind: 'taper' });
		out.push({ id: 'taper-end', label: 'Allowance gone', phrase: 'the point where your allowance reaches zero', value: start + standardPa / rate, kind: 'taper' });
	} catch {
		/* not set */
	}
	for (const plan of plans) {
		try {
			const t = resolve(year.studentLoans[plan].threshold, `studentLoans.${plan}.threshold`, asAt).value;
			out.push({ id: `loan-${plan}`, label: `${PLAN_LABEL[plan]} repayments`, phrase: `the ${PLAN_LABEL[plan]} repayment threshold`, value: t, kind: 'loan' });
		} catch {
			/* not set */
		}
	}

	// Merge marks that share a value, so the ruler labels each point once.
	const merged = new Map<number, RulerThreshold>();
	for (const t of out.sort((a, b) => a.value - b.value)) {
		const existing = merged.get(t.value);
		if (existing) {
			// "Additional rate and allowance gone", but "... and NI upper earnings limit".
			existing.label = `${existing.label} and ${/^[A-Z][a-z]/.test(t.label) ? t.label[0].toLowerCase() + t.label.slice(1) : t.label}`;
			existing.phrase = `${existing.phrase} and ${t.phrase}`;
		} else merged.set(t.value, { ...t });
	}
	return [...merged.values()];
}

export function nextThresholdFor(thresholds: RulerThreshold[], income: number): NextThreshold | null {
	const next = thresholds.find((t) => t.value > income);
	if (!next) return null;
	const distance = round2(next.value - income);
	return { threshold: next, distance, sentence: `You are ${money(distance)} below ${next.phrase} (${money(next.value)}).` };
}
