// Tax on a side hustle: trading income less expenses or the trading
// allowance, income tax on the profit on top of other income at the
// nation's bands, and Class 4 National Insurance on the profit. Then what
// Self Assessment asks for and when: the bill by 31 January after the tax
// year, with a first payment on account towards the next year when payments
// on account apply, shown as a first year in Self Assessment sees it.

import { getYear, resolve, today, yearFor } from './config.ts';
import { makingTaxDigitalCheck, withInformationSources } from './makingTaxDigital.ts';
import { floorPound, round2 } from './rounding.ts';
import { allowanceFor, allowanceLine, asAtWithin, compareWithNext, longDate, money, money0, nationBands, pct, sliceLines, taxOnTop, Used } from './simple.ts';
import type { LedgerLine, Nation, SimpleResult, YearConfig } from './types.ts';

export interface SideHustleTaxInput {
	/** Money received from the trade in the year, before expenses. */
	income: number;
	/** Costs of the trade: stock, materials, fees, mileage at the approved rate. */
	expenses: number;
	/** Taxable income from elsewhere: pay, pensions. */
	otherIncome: number;
	nation: Nation;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const SIDE_HUSTLE_TOUCHES = /^(incomeTax\.(tradingAllowance|personalAllowance|taperStart|bands\.)|nationalInsurance\.selfEmployed\.class4\.)/;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "31 January" in the calendar year `yearsAfter` years after the one the tax year ends in, as an ISO date. */
export function dayMonthAfter(dayMonth: string, year: YearConfig, yearsAfter: number): string {
	const m = dayMonth.match(/^(\d{1,2}) ([A-Z][a-z]+)$/);
	const month = m ? MONTHS.indexOf(m[2]) : -1;
	if (!m || month < 0) throw new Error(`Not a day and month: ${dayMonth}`);
	const y = Number(year.ends.slice(0, 4)) + yearsAfter;
	return `${y}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}

export interface SelfAssessmentPayments {
	/** Whether payments on account towards the next year apply. */
	applies: boolean;
	/** Why they apply or do not. */
	reason: 'applies' | 'nothing-due' | 'below-threshold' | 'collected-at-source';
	/** Each of the two payments on account. */
	payment: number;
	/** The date the bill and the first payment on account are due. */
	dueDate: string;
	/** The date the second payment on account is due. */
	secondDate: string;
	/** The bill plus the first payment on account. */
	dueJanuary: number;
	/** Share of the year's tax collected outside Self Assessment. */
	outsideShare: number;
	lines: LedgerLine[];
	warnings: string[];
}

/**
 * What a first year in Self Assessment pays and when. `bill` is the tax and
 * Class 4 due through Self Assessment for the year; `taxOutside` is tax for
 * the same year collected elsewhere, for example through PAYE. Returns null
 * when the year records no Self Assessment rules.
 */
export function selfAssessmentPayments(year: YearConfig, asAt: string, bill: number, taxOutside: number, used: Used): SelfAssessmentPayments | null {
	const sa = year.selfAssessment;
	if (!sa) return null;
	const poa = sa.paymentsOnAccount;
	const due = resolve(sa.paymentDue, 'selfAssessment.paymentDue', asAt);
	const threshold = resolve(poa.billThreshold, 'selfAssessment.paymentsOnAccount.billThreshold', asAt);
	const share = resolve(poa.deductedAtSourceFraction, 'selfAssessment.paymentsOnAccount.deductedAtSourceFraction', asAt);
	const each = resolve(poa.eachPaymentFraction, 'selfAssessment.paymentsOnAccount.eachPaymentFraction', asAt);
	const second = resolve(poa.secondDue, 'selfAssessment.paymentsOnAccount.secondDue', asAt);
	const dueDate = dayMonthAfter(due.value, year, 1);
	const secondDate = dayMonthAfter(second.value, year, 1);
	const followingDue = dayMonthAfter(due.value, year, 2);
	const nextStart = Number(year.taxYear.slice(0, 4)) + 1;
	const nextLabel = `${nextStart}/${String(nextStart + 1).slice(2)}`;

	const allTax = round2(taxOutside + bill);
	const outsideShare = allTax > 0 ? taxOutside / allTax : 0;
	const reason: SelfAssessmentPayments['reason'] = bill <= 0 ? 'nothing-due' : bill < threshold.value ? 'below-threshold' : outsideShare > share.value ? 'collected-at-source' : 'applies';
	const applies = reason === 'applies';
	const payment = applies ? round2(bill * each.value) : 0;
	const dueJanuary = round2(bill + payment);
	const warnings: string[] = [];
	used.add(due);
	used.add(threshold);
	if (bill >= threshold.value) used.add(share);
	if (applies) {
		used.add(each);
		used.add(second);
	}

	const shareSentence = `${money(taxOutside)} of the year's ${money(allTax)} of tax is ${pct(outsideShare)}. This treats all the tax on your other income as collected before it reached you, for example through PAYE.`;
	const lines: LedgerLine[] = [];
	lines.push({
		id: 'payment-on-account',
		label: `First payment on account for ${nextLabel}`,
		kind: 'info',
		rate: applies ? each.value : null,
		slice: applies ? bill : null,
		amount: payment,
		sign: 0,
		provenance: threshold.provenance,
		arithmetic:
			reason === 'applies'
				? `Payments on account are two advance payments towards the next year's bill, each ${pct(each.value)} of this year's: ${money(bill)} × ${pct(each.value)} = ${money(payment)}. They apply here because the bill is not less than ${money0(threshold.value)} and no more than ${pct(share.value)} of the year's tax was collected outside Self Assessment. ${shareSentence}`
				: reason === 'below-threshold'
					? `No payments on account: the bill of ${money(bill)} is less than ${money0(threshold.value)}.`
					: reason === 'collected-at-source'
						? `No payments on account: more than ${pct(share.value)} of the year's tax was collected outside Self Assessment. ${shareSentence}`
						: 'Nothing is due, so there are no payments on account.',
	});
	lines.push({
		id: 'due-january',
		label: `Due by ${longDate(dueDate)}`,
		kind: 'info',
		rate: null,
		slice: null,
		amount: dueJanuary,
		sign: 0,
		provenance: due.provenance,
		arithmetic: applies
			? `For a first year in Self Assessment, with no payments on account already made: the ${year.label} bill of ${money(bill)} plus the first payment on account of ${money(payment)} = ${money(dueJanuary)}, due by midnight on ${longDate(dueDate)}.`
			: `The ${year.label} bill of ${money(bill)} is due by midnight on ${longDate(dueDate)}. No payment on account is added.`,
	});
	if (applies) {
		lines.push({
			id: 'due-july',
			label: `Due by ${longDate(secondDate)}`,
			kind: 'info',
			rate: null,
			slice: null,
			amount: payment,
			sign: 0,
			provenance: second.provenance,
			arithmetic: `The second payment on account towards ${nextLabel}: ${money(payment)}. If the ${nextLabel} bill comes to more than the two payments together, ${money(round2(payment * 2))}, the rest is due by ${longDate(followingDue)}.`,
		});
		// A date that is not yet in force carries its caveat into the result.
		if (second.provenance.status !== 'in-force' && second.provenance.note) warnings.push(`${second.provenance.note}.`);
	}
	return { applies, reason, payment, dueDate, secondDate, dueJanuary, outsideShare, lines, warnings };
}

export function sideHustleTax(input: SideHustleTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const income = Math.max(0, round2(input.income || 0));
	const expenses = Math.max(0, round2(input.expenses || 0));
	const other = Math.max(0, round2(input.otherIncome || 0));
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	const allowance = resolve(year.incomeTax.tradingAllowance, 'incomeTax.tradingAllowance', asAt);
	used.add(allowance);
	const route: 'allowance' | 'expenses' = expenses > allowance.value ? 'expenses' : 'allowance';
	const deducted = route === 'expenses' ? expenses : Math.min(income, allowance.value);
	const profit = round2(Math.max(0, income - deducted));
	if (route === 'expenses' && expenses > income) warnings.push(`Expenses exceed income by ${money(expenses - income)}. A trading loss can be set against other income or carried forward; this tool does not model that.`);

	const total = round2(other + profit);
	const pa = allowanceFor(total, year, asAt, used);
	const paOnOther = Math.min(pa.allowance, other);
	const paOnProfit = round2(Math.min(profit, pa.allowance - paOnOther));
	const otherTaxable = floorPound(Math.max(0, other - paOnOther));
	const taxableProfit = floorPound(Math.max(0, profit - paOnProfit));
	const bands = nationBands(year, input.nation, used);
	const tax = taxOnTop(taxableProfit, otherTaxable, bands);

	// Class 4 National Insurance on the profit alone.
	const c4 = year.nationalInsurance.selfEmployed.class4;
	const lpl = resolve(c4.lowerProfitsLimit, 'nationalInsurance.selfEmployed.class4.lowerProfitsLimit', asAt);
	const upl = resolve(c4.upperProfitsLimit, 'nationalInsurance.selfEmployed.class4.upperProfitsLimit', asAt);
	const mainRate = resolve(c4.mainRate, 'nationalInsurance.selfEmployed.class4.mainRate', asAt);
	const upperRate = resolve(c4.upperRate, 'nationalInsurance.selfEmployed.class4.upperRate', asAt);
	const profitPounds = floorPound(profit);
	const mainSlice = Math.max(0, Math.min(profitPounds, upl.value) - lpl.value);
	const upperSlice = Math.max(0, profitPounds - upl.value);
	const class4Main = round2(mainSlice * mainRate.value);
	const class4Upper = round2(upperSlice * upperRate.value);
	const class4 = round2(class4Main + class4Upper);
	used.add(lpl);
	if (mainSlice > 0) used.add(mainRate);
	if (upperSlice > 0) {
		used.add(upl);
		used.add(upperRate);
	}

	lines.push({ id: 'income', label: 'Trading income', kind: 'income', rate: null, slice: null, amount: income, sign: 1, provenance: null, arithmetic: `Money received from the trade in the year, before costs: ${money(income)}.` });
	if (route === 'expenses') {
		lines.push({ id: 'expenses', label: 'Expenses', kind: 'deduction', rate: null, slice: null, amount: expenses, sign: -1, provenance: allowance.provenance, arithmetic: `Expenses of ${money(expenses)} are more than the ${money0(allowance.value)} trading allowance, so they are deducted instead of it. The allowance and expenses cannot both be used.` });
	} else {
		lines.push({ id: 'trading-allowance', label: 'Trading allowance', kind: 'deduction', rate: null, slice: null, amount: deducted, sign: -1, provenance: allowance.provenance, arithmetic: expenses > 0 ? `The ${money0(allowance.value)} trading allowance is more than your ${money(expenses)} of expenses, so it is deducted instead of them.` : `The first ${money0(allowance.value)} of trading income is tax free. ${income <= allowance.value ? 'All of the income is covered and it does not need to be reported.' : ''}`.trim() });
	}
	lines.push({ id: 'profit', label: 'Taxable profit', kind: 'info', rate: null, slice: null, amount: profit, sign: 0, provenance: null, arithmetic: `${money(income)} − ${money(deducted)} = ${money(profit)}.` });
	lines.push({ id: 'other', label: 'Other income', kind: 'info', rate: null, slice: null, amount: other, sign: 0, provenance: null, arithmetic: `Pay, pensions and other taxable income: ${money(other)}. It is taxed first, so it sets where the profit sits in the bands.` });
	lines.push(allowanceLine(pa, 'profit', paOnProfit, total));
	lines.push(...sliceLines(tax.slices, 'tax', 'Income tax on profit', 'Profit'));
	lines.push({
		id: 'class4',
		label: 'Class 4 National Insurance',
		kind: 'deduction',
		rate: mainSlice > 0 ? mainRate.value : null,
		slice: mainSlice + upperSlice,
		amount: class4,
		sign: -1,
		provenance: mainSlice > 0 ? mainRate.provenance : lpl.provenance,
		arithmetic:
			mainSlice > 0
				? `Profit between the ${money0(lpl.value)} lower profits limit and the ${money0(upl.value)} upper profits limit: ${money(mainSlice)} × ${pct(mainRate.value)} = ${money(class4Main)}.${upperSlice > 0 ? ` Above the upper limit: ${money(upperSlice)} × ${pct(upperRate.value)} = ${money(class4Upper)}.` : ''} Class 2 is treated as paid on profits above the small profits threshold and is voluntary below it.`
				: `Profit of ${money(profit)} is at or below the ${money0(lpl.value)} lower profits limit, so no Class 4 is due. Class 4 is worked out on the profit alone, not on other income.`,
	});
	const totalDue = round2(tax.total + class4);
	lines.push({ id: 'total', label: 'Tax and National Insurance on your side hustle', kind: 'total', rate: null, slice: null, amount: totalDue, sign: -1, provenance: null, arithmetic: `${money(tax.total)} + ${money(class4)} = ${money(totalDue)}.` });

	// Self Assessment: when the bill is due and whether payments on account are added. Tax on the other
	// income is treated as collected at source, which decides the share paid outside Self Assessment.
	const otherTax = taxOnTop(otherTaxable, 0, bands).total;
	const sa = selfAssessmentPayments(year, asAt, totalDue, otherTax, used);
	if (sa && totalDue > 0) {
		lines.push(...sa.lines);
		warnings.push(...sa.warnings);
	}

	const mtd = makingTaxDigitalCheck(year, income, 'trading income');
	if (mtd) lines.push(mtd.line);

	const note =
		income === 0
			? 'Enter what the side hustle brought in.'
			: profit === 0
				? route === 'allowance'
					? `Income of ${money(income)} is within the ${money0(allowance.value)} trading allowance, so nothing is taxed and it does not need to be reported.`
					: 'Expenses are at least as large as the income, so there is no taxable profit.'
				: totalDue === 0
					? `The profit of ${money(profit)} is covered by the personal allowance.`
					: `${money(taxableProfit)} of profit is taxed at ${tax.slices.map((s) => pct(s.rate)).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}${class4 > 0 ? `, plus Class 4 National Insurance` : ''}.${sa ? (sa.applies ? ` In a first year in Self Assessment, ${money(sa.dueJanuary)} is due by ${longDate(sa.dueDate)}: the bill plus a first payment on account of ${money(sa.payment)}.` : ` It is due by ${longDate(sa.dueDate)}, with no payments on account.`) : ''}`;

	const facts: Record<string, number | string> = { profit, taxableProfit, incomeTax: tax.total, class4, total: totalDue, route, deducted };
	if (sa) {
		facts.paymentsOnAccount = sa.applies ? 'yes' : 'no';
		facts.paymentsOnAccountReason = sa.reason;
		facts.paymentOnAccount = sa.payment;
		facts.dueJanuary = sa.dueJanuary;
		facts.dueJuly = sa.payment;
		facts.paymentDue = sa.dueDate;
		facts.taxOutsideSelfAssessment = otherTax;
	}
	if (mtd) {
		facts.makingTaxDigital = mtd.position;
		if (mtd.threshold !== null) facts.makingTaxDigitalThreshold = mtd.threshold;
		if (mtd.startDate !== null) facts.makingTaxDigitalStart = mtd.startDate;
	}
	const rulesUsed = used.rulesUsed(year, input.nation, asAt);

	const result: SimpleResult = {
		tool: 'side-hustle-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Tax and National Insurance on your side hustle', amount: totalDue, unit: 'a year' },
		figures: [
			{ label: 'Kept after tax', amount: round2(income - (route === 'expenses' ? expenses : 0) - totalDue) },
			{ label: 'Income tax', amount: tax.total },
			{ label: 'Class 4 National Insurance', amount: class4 },
			...(sa && totalDue > 0 ? [{ label: `Due by ${longDate(sa.dueDate)}`, amount: sa.dueJanuary }] : []),
		],
		note,
		lines,
		caption: `How ${money0(income)} of trading income is taxed in ${year.label}`,
		comparison: null,
		rulesUsed: mtd ? withInformationSources(rulesUsed, mtd.provenance) : rulesUsed,
		warnings,
		facts,
	};
	if (input.compare !== false) {
		result.comparison = compareWithNext(result, year, SIDE_HUSTLE_TOUCHES, (taxYear, at) => sideHustleTax({ ...input, taxYear, asAt: at, compare: false }), 'tax and National Insurance');
	}
	return result;
}
