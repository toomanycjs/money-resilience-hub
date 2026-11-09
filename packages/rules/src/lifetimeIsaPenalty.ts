// The Lifetime ISA withdrawal charge: nothing for a first home at or under
// the price cap, at 60 or over, or on terminal illness; the reduced charge
// for a first home over the cap from 29 October 2026 (read through
// effectiveFrom and previous); the full charge for any other withdrawal.

import { resolve, yearFor } from './config.ts';
import { round2 } from './rounding.ts';
import { longDate, money, money0, pct, Used } from './simple.ts';
import { RulesUnavailableError, type LedgerLine, type SimpleResult, type YearComparison } from './types.ts';

export type LisaReason = 'first-home' | 'other' | 'age-60' | 'terminal-illness';
export const LISA_REASONS: LisaReason[] = ['first-home', 'other', 'age-60', 'terminal-illness'];
export const LISA_REASON_LABEL: Record<LisaReason, string> = {
	'first-home': 'Buying a first home',
	other: 'Any other reason',
	'age-60': 'Aged 60 or over',
	'terminal-illness': 'Terminal illness',
};

export interface LifetimeIsaPenaltyInput {
	/** Amount taken out of the Lifetime ISA, including the bonus it holds. */
	amount: number;
	reason: LisaReason;
	/** Purchase price of the first home, used only for that reason. */
	homePrice?: number;
	/** Date of the withdrawal, ISO. */
	date: string;
}

export function lifetimeIsaPenalty(input: LifetimeIsaPenaltyInput): SimpleResult {
	const date = input.date;
	const year = yearFor(date);
	const amount = Math.max(0, round2(input.amount || 0));
	const price = Math.max(0, round2(input.homePrice || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];
	const lisa = year.isa?.lifetimeIsa;
	if (!lisa) throw new RulesUnavailableError(`The Lifetime ISA rules for ${year.label} have not been recorded`, 'isa.lifetimeIsa');

	const cap = resolve(lisa.propertyCap, 'isa.lifetimeIsa.propertyCap', date);
	const full = resolve(lisa.withdrawalCharge, 'isa.lifetimeIsa.withdrawalCharge', date);
	const bonus = lisa.bonusRate ? resolve(lisa.bonusRate, 'isa.lifetimeIsa.bonusRate', date) : null;

	let rate = 0;
	let why: string;
	let provenance = full.provenance;
	let comparison: YearComparison | null = null;
	if (input.reason === 'first-home') {
		used.add(cap);
		if (price <= cap.value) {
			why = `A first home costing ${money(price)} is at or under the ${money0(cap.value)} price cap, so there is no withdrawal charge.`;
			provenance = cap.provenance;
		} else {
			const over = resolve(lisa.firstHomeOverCapCharge, 'isa.lifetimeIsa.firstHomeOverCapCharge', date);
			rate = used.add(over);
			provenance = over.provenance;
			why = `A first home costing ${money(price)} is over the ${money0(cap.value)} price cap, so the charge is ${pct(rate)} of the amount withdrawn.`;
			const leaf = lisa.firstHomeOverCapCharge;
			if (leaf.effectiveFrom && leaf.previous && date >= leaf.effectiveFrom) {
				const before = resolve(leaf.previous, 'isa.lifetimeIsa.firstHomeOverCapCharge.previous', date);
				const charge = round2(amount * before.value);
				const difference = round2(charge - round2(amount * rate));
				comparison = { taxYear: year.taxYear, label: `before ${longDate(leaf.effectiveFrom)}`, amount: charge, difference, sentence: `Before ${longDate(leaf.effectiveFrom)} the charge on this withdrawal was ${pct(before.value)}, ${money(charge)}, which is ${money(difference)} more.` };
			}
		}
	} else if (input.reason === 'other') {
		rate = used.add(full);
		why = `A withdrawal for any reason other than a first home, age 60 or terminal illness carries the ${pct(rate)} charge.`;
	} else {
		used.add(full);
		why = input.reason === 'age-60' ? 'From age 60 money can be taken out with no charge.' : 'With a terminal illness money can be taken out with no charge.';
	}

	const charge = round2(amount * rate);
	const received = round2(amount - charge);
	lines.push({ id: 'withdrawal', label: 'Amount withdrawn', kind: 'income', rate: null, slice: null, amount, sign: 1, provenance: null, arithmetic: `${money(amount)} taken from the Lifetime ISA, including the government bonus it holds.` });
	if (bonus) {
		used.add(bonus);
		const bonusShare = round2(amount - amount / (1 + bonus.value));
		const paidIn = round2(amount - bonusShare);
		lines.push({ id: 'bonus-share', label: 'Of which government bonus', kind: 'info', rate: bonus.value, slice: paidIn, amount: bonusShare, sign: 0, provenance: bonus.provenance, arithmetic: `If the pot grew only from the ${pct(bonus.value)} bonus, ${money(paidIn)} was paid in and ${money(bonusShare)} is bonus. Interest or growth would change the split.` });
	}
	lines.push({ id: 'charge', label: 'Withdrawal charge', kind: 'deduction', rate, slice: amount, amount: charge, sign: -1, provenance, arithmetic: `${why} ${money(amount)} × ${pct(rate)} = ${money(charge)}.` });
	lines.push({ id: 'received', label: 'You receive', kind: 'total', rate: null, slice: null, amount: received, sign: 1, provenance: null, arithmetic: `${money(amount)} − ${money(charge)} = ${money(received)}.` });

	let lossVsPaidIn = 0;
	if (bonus && charge > 0) {
		const paidIn = round2(amount / (1 + bonus.value));
		lossVsPaidIn = round2(paidIn - received);
		lines.push({ id: 'vs-paid-in', label: 'Compared with what was paid in', kind: 'info', rate: paidIn > 0 ? round2((lossVsPaidIn / paidIn) * 10000) / 10000 : 0, slice: paidIn, amount: Math.abs(lossVsPaidIn), sign: 0, provenance: bonus.provenance, arithmetic: lossVsPaidIn > 0 ? `${money(received)} received against ${money(paidIn)} paid in: ${money(lossVsPaidIn)} less, ${pct(lossVsPaidIn / paidIn)} of the money paid in, before any interest or growth.` : lossVsPaidIn < 0 ? `${money(received)} received against ${money(paidIn)} paid in: ${money(-lossVsPaidIn)} more, before any interest or growth.` : `${money(received)} received against ${money(paidIn)} paid in: the charge takes exactly the bonus, before any interest or growth.` });
	}

	const result: SimpleResult = {
		tool: 'lifetime-isa-penalty',
		taxYear: year.taxYear,
		label: year.label,
		nation: 'england-ni',
		asAt: date,
		headline: { label: 'Withdrawal charge', amount: charge, unit: `on ${money0(amount)}` },
		figures: [
			{ label: 'You receive', amount: received },
			{ label: 'Charge rate', amount: rate, rate: true },
		],
		note: why,
		lines,
		caption: `The charge on a ${money0(amount)} Lifetime ISA withdrawal on ${longDate(date)}`,
		comparison,
		rulesUsed: used.rulesUsed(year, 'england-ni', date),
		warnings,
		facts: { rate, charge, received, lossVsPaidIn, reason: input.reason },
	};
	return result;
}
