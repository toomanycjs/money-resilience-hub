// A one-off bonus on top of a salary. Income tax under PAYE adds pay up
// over the year, so the tax on the bonus is the difference between the
// year with it and the year without. National Insurance and student loan
// repayments look at each pay period on its own, so the bonus month is
// worked out against the monthly thresholds.

import { getYear, resolve, today, yearFor } from './config.ts';
import { floorPound, round2 } from './rounding.ts';
import { deductionSources, need, nextYearLine, plansOf, useBreakdown, type PlanChoice } from './payShared.ts';
import { asAtWithin, money, money0, pct, Used } from './simple.ts';
import { takeHome } from './takeHome.ts';
import { PLAN_LABEL, RulesUnavailableError, type LedgerLine, type Nation, type SimpleResult, type YearConfig } from './types.ts';

export interface BonusTaxInput {
	/** Salary a year, before tax, paid monthly. */
	salary: number;
	/** The one-off bonus, before tax, paid in one month. */
	bonus: number;
	nation: Nation;
	plan?: PlanChoice;
	taxYear?: string;
	asAt?: string;
	compare?: boolean;
}

export const BONUS_TOUCHES = /^(incomeTax\.(personalAllowance|taperStart|bands\.)|nationalInsurance\.employee\.(mainRate|upperRate|primaryThresholdMonthly|upperEarningsLimitMonthly)$|studentLoans\.)/;

export function bonusTax(input: BonusTaxInput): SimpleResult {
	const requested = input.asAt ?? today();
	const year: YearConfig = input.taxYear ? getYear(input.taxYear) : yearFor(requested);
	const asAt = asAtWithin(requested, year);
	const salary = Math.max(0, round2(input.salary || 0));
	const bonus = Math.max(0, round2(input.bonus || 0));
	const plans = plansOf(input.plan);
	const used = new Used();
	const warnings: string[] = [];
	const lines: LedgerLine[] = [];

	// Income tax: the year with the bonus less the year without.
	const base = { nation: input.nation, studentLoanPlans: plans, taxYear: year.taxYear, asAt };
	const before = takeHome({ ...base, gross: salary }, { withMarginal: false });
	const after = takeHome({ ...base, gross: round2(salary + bonus) }, { withMarginal: false });
	useBreakdown(used, before);
	useBreakdown(used, after);
	const src = deductionSources(after, year);
	const extraTax = round2(after.incomeTax.total - before.incomeTax.total);

	// National Insurance: the bonus month on its own, against the monthly thresholds.
	const e = year.nationalInsurance.employee;
	const ptM = need(e.primaryThresholdMonthly, 'nationalInsurance.employee.primaryThresholdMonthly', asAt, 'The monthly primary threshold');
	const uelM = need(e.upperEarningsLimitMonthly, 'nationalInsurance.employee.upperEarningsLimitMonthly', asAt, 'The monthly upper earnings limit');
	const main = resolve(e.mainRate, 'nationalInsurance.employee.mainRate', asAt);
	const upper = resolve(e.upperRate, 'nationalInsurance.employee.upperRate', asAt);
	used.add(ptM);
	used.add(uelM);
	const monthPay = round2(salary / 12);
	const bonusMonthPay = round2(monthPay + bonus);
	const niFor = (pay: number) => {
		const mainSlice = Math.max(0, Math.min(pay, uelM.value) - ptM.value);
		const upperSlice = Math.max(0, pay - uelM.value);
		const atMain = round2(mainSlice * main.value);
		const atUpper = round2(upperSlice * upper.value);
		return { mainSlice, upperSlice, atMain, atUpper, total: round2(atMain + atUpper) };
	};
	const niNormal = niFor(monthPay);
	const niBonus = niFor(bonusMonthPay);
	const extraNi = round2(niBonus.total - niNormal.total);
	const annualNi = round2(after.nationalInsurance.total - before.nationalInsurance.total);

	// Student loan: also per pay period, against a twelfth of the annual threshold.
	let extraLoan = 0;
	let loanLine: LedgerLine | null = null;
	for (const plan of plans) {
		try {
			const threshold = resolve(year.studentLoans[plan].threshold, `studentLoans.${plan}.threshold`, asAt);
			const rate = resolve(year.studentLoans[plan].rate, `studentLoans.${plan}.rate`, asAt);
			used.add(threshold);
			const monthly = Math.floor((threshold.value / 12) * 100) / 100;
			const normal = floorPound(Math.max(0, monthPay - monthly) * rate.value);
			const withBonus = floorPound(Math.max(0, bonusMonthPay - monthly) * rate.value);
			extraLoan = round2(withBonus - normal);
			loanLine = {
				id: 'loan',
				label: `Student loan on the bonus (${PLAN_LABEL[plan]})`,
				kind: 'deduction',
				rate: rate.value,
				slice: round2(Math.max(0, bonusMonthPay - Math.max(monthly, monthPay))),
				amount: extraLoan,
				sign: -1,
				provenance: threshold.provenance,
				arithmetic: `Repayments are worked out on each month's pay. The monthly threshold is a twelfth of ${money0(threshold.value)}, ${money(monthly)}. In the bonus month ${pct(rate.value)} of ${money(Math.max(0, round2(bonusMonthPay - monthly)))} is ${money(withBonus)}, rounded down to a pound, against ${money(normal)} in a normal month. The bonus adds ${money(extraLoan)}.`,
			};
		} catch (err) {
			if (err instanceof RulesUnavailableError) warnings.push(`${PLAN_LABEL[plan]} for ${year.label} is not yet set, so no student loan repayment is shown: ${err.message.replace(/^.*?: /, '')}`);
			else throw err;
		}
	}

	const deductions = round2(extraTax + extraNi + extraLoan);
	const kept = round2(bonus - deductions);
	const keptShare = bonus > 0 ? round2((kept / bonus) * 10000) / 10000 : 0;

	lines.push({ id: 'salary', label: 'Salary', kind: 'info', rate: null, slice: null, amount: salary, sign: 0, provenance: null, arithmetic: `${money(salary)} a year is ${money(monthPay)} in a normal month.` });
	lines.push({ id: 'bonus', label: 'Bonus', kind: 'income', rate: null, slice: null, amount: bonus, sign: 1, provenance: null, arithmetic: `Paid in one month, making that month's pay ${money(monthPay)} + ${money(bonus)} = ${money(bonusMonthPay)}.` });
	lines.push({
		id: 'tax',
		label: 'Income tax on the bonus',
		kind: 'deduction',
		rate: bonus > 0 ? round2((extraTax / bonus) * 10000) / 10000 : null,
		slice: bonus,
		amount: extraTax,
		sign: -1,
		provenance: src.tax,
		arithmetic: `PAYE adds pay up over the tax year, so the bonus is taxed as the top slice of the year's pay. Income tax on ${money(salary)} is ${money(before.incomeTax.total)}; on ${money(round2(salary + bonus))} it is ${money(after.incomeTax.total)}. The difference is ${money(extraTax)}. The bonus payslip can show more or less than this, with the rest evened out over the other months.`,
	});
	lines.push({
		id: 'ni',
		label: 'National Insurance on the bonus',
		kind: 'deduction',
		rate: bonus > 0 ? round2((extraNi / bonus) * 10000) / 10000 : null,
		slice: bonus,
		amount: extraNi,
		sign: -1,
		provenance: uelM.provenance,
		arithmetic:
			`National Insurance looks at each pay period alone. In the bonus month, pay between ${money0(ptM.value)} and ${money0(uelM.value)}: ${money(niBonus.mainSlice)} × ${pct(main.value)} = ${money(niBonus.atMain)}` +
			(niBonus.upperSlice > 0 ? `; pay above ${money0(uelM.value)}: ${money(niBonus.upperSlice)} × ${pct(upper.value)} = ${money(niBonus.atUpper)}` : '') +
			`. That is ${money(niBonus.total)}, against ${money(niNormal.total)} in a normal month, so the bonus adds ${money(extraNi)}. ` +
			(Math.abs(annualNi - extraNi) >= 0.005
				? `Spread across the year the same bonus would add ${money(annualNi)}: the annual figure uses twelve months of thresholds, the payslip uses one.`
				: `Spread across the year the bonus would add the same amount.`),
	});
	if (loanLine) lines.push(loanLine);
	lines.push({ id: 'kept', label: 'Kept from the bonus', kind: 'total', rate: keptShare, slice: bonus, amount: kept, sign: 1, provenance: null, arithmetic: `${money(bonus)} − ${money(deductions)} = ${money(kept)}, which is ${pct(keptShare)} of the bonus.` });

	for (const w of after.warnings) if (!warnings.includes(w) && !/is not yet set/.test(w)) warnings.push(w);

	const note =
		bonus === 0
			? 'Enter the bonus before tax.'
			: Math.abs(annualNi - extraNi) >= 0.005
				? `National Insurance on the bonus is ${money(extraNi)} in the month it is paid, not the ${money(annualNi)} an annual calculation gives, because each pay period has its own thresholds.`
				: `${money(deductions)} of the bonus goes in ${['income tax', extraNi > 0 ? 'National Insurance' : '', extraLoan > 0 ? 'student loan repayments' : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;

	const figures = [
		{ label: 'Income tax', amount: extraTax },
		{ label: 'National Insurance', amount: extraNi },
		...(plans.length && loanLine ? [{ label: 'Student loan', amount: extraLoan }] : []),
		{ label: 'Share kept', amount: keptShare, rate: true },
	];

	const result: SimpleResult = {
		tool: 'bonus-tax',
		taxYear: year.taxYear,
		label: year.label,
		nation: input.nation,
		asAt,
		headline: { label: 'Kept from your bonus', amount: kept, unit: 'after deductions' },
		figures,
		note,
		lines,
		caption: `What is taken from a ${money0(bonus)} bonus on a ${money0(salary)} salary in ${year.label}`,
		comparison: null,
		rulesUsed: used.rulesUsed(year, input.nation, asAt),
		warnings,
		facts: { extraTax, extraNi, extraLoan, kept, keptShare, bonusMonthNi: niBonus.total, normalMonthNi: niNormal.total, annualMethodNi: annualNi },
	};
	if (input.compare !== false) {
		result.comparison = nextYearLine(result, year, (taxYear, at) => bonusTax({ ...input, taxYear, asAt: at, compare: false }), 'bonus kept');
	}
	return result;
}
