// The single-purpose tools: what each form asks, how its strings become
// engine input, and the share link and saved inputs for it. Inputs travel
// in the URL hash and in localStorage only, never in a query string or a
// request. The arithmetic lives in packages/rules.

import {
	landlordTax,
	lifetimeIsaPenalty,
	LISA_REASON_LABEL,
	LISA_REASONS,
	NATION_LABEL,
	NATIONS,
	savingsTax,
	sideHustleTax,
	statePensionTax,
	LANDLORD_TOUCHES,
	SAVINGS_TOUCHES,
	SIDE_HUSTLE_TOUCHES,
	STATE_PENSION_TOUCHES,
	type LisaReason,
	type Nation,
	type SimpleResult,
} from '@money-resilience-hub/rules';
import {
	bonusTax,
	childBenefitCharge,
	hourlyToSalary,
	maternityPay,
	mileageAllowance,
	paternityPay,
	payRise,
	pensionContributions,
	BONUS_TOUCHES,
	CHILD_BENEFIT_TOUCHES,
	MATERNITY_TOUCHES,
	MILEAGE_TOUCHES,
	MILEAGE_VEHICLE_LABEL,
	MILEAGE_VEHICLES,
	PATERNITY_TOUCHES,
	PAY_TOUCHES,
	PLAN_LABEL,
	PLANS,
	type MileageVehicle,
	type Plan,
} from '@money-resilience-hub/rules';
import { isNation } from './schema.ts';

export interface SimpleField {
	id: string;
	label: string;
	type: 'money' | 'select' | 'date' | 'taxYear' | 'number';
	default: string;
	unit?: string;
	help?: string;
	placeholder?: string;
	options?: { value: string; label: string }[];
	/** Shown only when another field has one of these values. */
	showWhen?: { field: string; values: string[] };
}

/** Every field as a string, as a form holds it. */
export type SimpleForm = Record<string, string>;

export interface SimpleTool {
	id: string;
	fields: SimpleField[];
	/** Config paths whose change between years touches this tool, for the "what changes" list. */
	touches: RegExp;
	/** The tax year field, if the tool has one; the Lifetime ISA tool reads the year from its date. */
	hasTaxYear: boolean;
	/** Heading of the ledger's amount column when the figures are not annual. */
	amountHeading?: string;
	compute: (form: SimpleForm, asAt: string) => SimpleResult;
}

const nationField: SimpleField = { id: 'nation', label: 'Where you live', type: 'select', options: NATIONS.map((n) => ({ value: n, label: NATION_LABEL[n] })), default: 'england-ni' };
const taxYearField: SimpleField = { id: 'taxYear', label: 'Tax year', type: 'taxYear', default: '' };

export function parseMoney(raw: string | undefined, fallback = '0', max = 10_000_000): number {
	const n = Number(String(raw ?? fallback).replace(/[£,\s]/g, ''));
	return Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));
}

function nationOf(form: SimpleForm): Nation {
	return isNation(form.nation) ? form.nation : 'england-ni';
}

function yearOf(form: SimpleForm): string | undefined {
	return form.taxYear && /^\d{4}-\d{2}$/.test(form.taxYear) ? form.taxYear : undefined;
}

/** A plain number: miles, hours, children, a percentage. */
export function parseNumber(raw: string | undefined, fallback = '0', max = 1_000_000): number {
	const text = String(raw ?? '').trim() === '' ? fallback : String(raw);
	const n = Number(text.replace(/[,\s%]/g, ''));
	return Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));
}

const planField: SimpleField = { id: 'plan', label: 'Student loan', type: 'select', options: [{ value: 'none', label: 'None' }, ...PLANS.map((p) => ({ value: p, label: PLAN_LABEL[p] }))], default: 'none' };

function planOf(form: SimpleForm): Plan | 'none' {
	return (PLANS as string[]).includes(form.plan) ? (form.plan as Plan) : 'none';
}

function isVehicle(x: unknown): x is MileageVehicle {
	return typeof x === 'string' && (MILEAGE_VEHICLES as string[]).includes(x);
}

function isReason(x: unknown): x is LisaReason {
	return typeof x === 'string' && (LISA_REASONS as string[]).includes(x);
}

export const TOOLS: Record<string, SimpleTool> = {
	'savings-tax': {
		id: 'savings-tax',
		fields: [
			{ id: 'interest', label: 'Savings interest', type: 'money', unit: 'a year', default: '1500', placeholder: '1500', help: 'Interest from banks, building societies and credit unions, before tax. Not ISA interest.' },
			{ id: 'otherIncome', label: 'Other income', type: 'money', unit: 'a year', default: '30000', placeholder: '30000', help: 'Pay, pensions and profits, before tax. Not dividends.' },
			nationField,
			taxYearField,
		],
		touches: SAVINGS_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => savingsTax({ interest: parseMoney(f.interest, '1500'), otherIncome: parseMoney(f.otherIncome, '30000'), nation: nationOf(f), taxYear: yearOf(f), asAt }),
	},
	'landlord-tax': {
		id: 'landlord-tax',
		fields: [
			{ id: 'rent', label: 'Rent received', type: 'money', unit: 'a year', default: '12000', placeholder: '12000' },
			{ id: 'expenses', label: 'Allowable expenses', type: 'money', unit: 'a year', default: '3000', placeholder: '3000', help: 'Agent fees, repairs, insurance, ground rent. Not mortgage interest or improvements.' },
			{ id: 'otherIncome', label: 'Other income', type: 'money', unit: 'a year', default: '30000', placeholder: '30000', help: 'Pay, pensions and profits, before tax.' },
			nationField,
			taxYearField,
		],
		touches: LANDLORD_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => landlordTax({ rent: parseMoney(f.rent, '12000'), expenses: parseMoney(f.expenses, '3000'), otherIncome: parseMoney(f.otherIncome, '30000'), nation: nationOf(f), taxYear: yearOf(f), asAt }),
	},
	'state-pension-tax': {
		id: 'state-pension-tax',
		fields: [
			{ id: 'statePension', label: 'State Pension', type: 'money', unit: 'a year', default: '', placeholder: '', help: 'What you receive in the year. The full new State Pension is pre-filled.' },
			{ id: 'otherIncome', label: 'Other income', type: 'money', unit: 'a year', default: '0', placeholder: '0', help: 'Private pensions, earnings and other taxable income.' },
			nationField,
			taxYearField,
		],
		touches: STATE_PENSION_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => statePensionTax({ statePension: parseMoney(f.statePension, '0'), otherIncome: parseMoney(f.otherIncome, '0'), nation: nationOf(f), taxYear: yearOf(f), asAt }),
	},
	'lifetime-isa-penalty': {
		id: 'lifetime-isa-penalty',
		fields: [
			{ id: 'amount', label: 'Amount withdrawn', type: 'money', unit: 'including the bonus', default: '10000', placeholder: '10000' },
			{ id: 'reason', label: 'Reason', type: 'select', options: LISA_REASONS.map((r) => ({ value: r, label: LISA_REASON_LABEL[r] })), default: 'first-home' },
			{ id: 'homePrice', label: 'Price of the home', type: 'money', unit: '', default: '300000', placeholder: '300000', showWhen: { field: 'reason', values: ['first-home'] } },
			{ id: 'date', label: 'Date of withdrawal', type: 'date', default: '', help: 'The charge for a first home over the price cap changed on 29 October 2026.' },
		],
		touches: /^isa\.lifetimeIsa\./,
		hasTaxYear: false,
		amountHeading: 'Amount',
		compute: (f, asAt) => lifetimeIsaPenalty({ amount: parseMoney(f.amount, '10000'), reason: isReason(f.reason) ? f.reason : 'first-home', homePrice: parseMoney(f.homePrice, '300000'), date: /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? '') ? f.date : asAt }),
	},
	'side-hustle-tax': {
		id: 'side-hustle-tax',
		fields: [
			{ id: 'income', label: 'Trading income', type: 'money', unit: 'a year', default: '2500', placeholder: '2500', help: 'What the side hustle brought in, before costs.' },
			{ id: 'expenses', label: 'Expenses', type: 'money', unit: 'a year', default: '200', placeholder: '200', help: 'Stock, materials, fees, mileage at the approved rate.' },
			{ id: 'otherIncome', label: 'Other income', type: 'money', unit: 'a year', default: '30000', placeholder: '30000', help: 'Pay, pensions and other taxable income.' },
			nationField,
			taxYearField,
		],
		touches: SIDE_HUSTLE_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => sideHustleTax({ income: parseMoney(f.income, '2500'), expenses: parseMoney(f.expenses, '200'), otherIncome: parseMoney(f.otherIncome, '30000'), nation: nationOf(f), taxYear: yearOf(f), asAt }),
	},
	'pay-rise': {
		id: 'pay-rise',
		fields: [
			{ id: 'salary', label: 'Salary now', type: 'money', unit: 'a year', default: '30000', placeholder: '30000', help: 'Before tax.' },
			{ id: 'riseType', label: 'The rise is given as', type: 'select', options: [{ value: 'percent', label: 'A percentage' }, { value: 'salary', label: 'A new salary' }], default: 'percent' },
			{ id: 'risePercent', label: 'Pay rise', type: 'number', unit: '%', default: '5', placeholder: '5', showWhen: { field: 'riseType', values: ['percent'] } },
			{ id: 'newSalary', label: 'New salary', type: 'money', unit: 'a year', default: '32000', placeholder: '32000', showWhen: { field: 'riseType', values: ['salary'] } },
			nationField,
			planField,
			taxYearField,
		],
		touches: PAY_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) =>
			payRise({ salary: parseMoney(f.salary, '30000'), ...(f.riseType === 'salary' ? { newSalary: parseMoney(f.newSalary, '0') } : { risePercent: parseNumber(f.risePercent, '0', 1000) }), nation: nationOf(f), plan: planOf(f), taxYear: yearOf(f), asAt }),
	},
	'bonus-tax': {
		id: 'bonus-tax',
		fields: [
			{ id: 'salary', label: 'Salary', type: 'money', unit: 'a year', default: '40000', placeholder: '40000', help: 'Before tax, paid monthly.' },
			{ id: 'bonus', label: 'Bonus', type: 'money', unit: 'one-off', default: '5000', placeholder: '5000', help: 'Before tax, paid in one month.' },
			nationField,
			planField,
			taxYearField,
		],
		touches: BONUS_TOUCHES,
		hasTaxYear: true,
		amountHeading: 'Amount',
		compute: (f, asAt) => bonusTax({ salary: parseMoney(f.salary, '40000'), bonus: parseMoney(f.bonus, '5000'), nation: nationOf(f), plan: planOf(f), taxYear: yearOf(f), asAt }),
	},
	'pension-contributions': {
		id: 'pension-contributions',
		fields: [
			{ id: 'salary', label: 'Salary', type: 'money', unit: 'a year', default: '40000', placeholder: '40000', help: 'Before tax.' },
			{ id: 'percent', label: 'Your contribution', type: 'number', unit: '% of salary', default: '5', placeholder: '5', help: 'The gross amount going into the pension from you, before anything an employer adds.' },
			nationField,
			planField,
			taxYearField,
		],
		touches: PAY_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => pensionContributions({ salary: parseMoney(f.salary, '40000'), percent: parseNumber(f.percent, '5', 100), nation: nationOf(f), plan: planOf(f), taxYear: yearOf(f), asAt }),
	},
	'hourly-to-salary': {
		id: 'hourly-to-salary',
		fields: [
			{ id: 'rate', label: 'Hourly rate', type: 'money', unit: 'an hour', default: '15', placeholder: '15', help: 'Before tax.' },
			{ id: 'hours', label: 'Hours', type: 'number', unit: 'a week', default: '37.5', placeholder: '37.5' },
			{ id: 'weeks', label: 'Paid weeks', type: 'number', unit: 'a year', default: '52', placeholder: '52', help: 'Count paid holiday. Use fewer weeks for term-time or seasonal work.' },
			nationField,
			planField,
			taxYearField,
		],
		touches: PAY_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => hourlyToSalary({ rate: parseMoney(f.rate, '15', 10_000), hours: parseNumber(f.hours, '37.5', 168), weeks: parseNumber(f.weeks, '52', 53), nation: nationOf(f), plan: planOf(f), taxYear: yearOf(f), asAt }),
	},
	'child-benefit-charge': {
		id: 'child-benefit-charge',
		fields: [
			{ id: 'income', label: 'Adjusted net income', type: 'money', unit: 'a year', default: '70000', placeholder: '70000', help: 'Of whichever partner has the higher income: taxable income less pension contributions and Gift Aid.' },
			{ id: 'children', label: 'Children', type: 'number', unit: 'getting child benefit', default: '2', placeholder: '2' },
			taxYearField,
		],
		touches: CHILD_BENEFIT_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => childBenefitCharge({ income: parseMoney(f.income, '70000'), children: parseNumber(f.children, '2', 20), taxYear: yearOf(f), asAt }),
	},
	'mileage-allowance': {
		id: 'mileage-allowance',
		fields: [
			{ id: 'vehicle', label: 'Vehicle', type: 'select', options: MILEAGE_VEHICLES.map((v) => ({ value: v, label: MILEAGE_VEHICLE_LABEL[v] })), default: 'car' },
			{ id: 'miles', label: 'Business miles', type: 'number', unit: 'in the tax year', default: '12000', placeholder: '12000', help: 'In your own vehicle. Not commuting to a usual place of work.' },
			{ id: 'employerPaid', label: 'Paid by your employer', type: 'money', unit: 'in the tax year', default: '3000', placeholder: '3000', help: 'Mileage payments for those miles. Enter 0 if none.' },
			{ id: 'income', label: 'Your taxable income', type: 'money', unit: 'a year', default: '40000', placeholder: '40000', help: 'Sets the rate of tax the relief takes off.' },
			nationField,
			taxYearField,
		],
		touches: MILEAGE_TOUCHES,
		hasTaxYear: true,
		compute: (f, asAt) => mileageAllowance({ vehicle: isVehicle(f.vehicle) ? f.vehicle : 'car', miles: parseNumber(f.miles, '12000', 1_000_000), employerPaid: parseMoney(f.employerPaid, '3000'), income: parseMoney(f.income, '40000'), nation: nationOf(f), taxYear: yearOf(f), asAt }),
	},
	'maternity-pay': {
		id: 'maternity-pay',
		fields: [
			{ id: 'weeklyEarnings', label: 'Average weekly earnings', type: 'money', unit: 'a week', default: '500', placeholder: '500', help: 'Before tax, averaged over the weeks an employer looks at before the qualifying week.' },
			taxYearField,
		],
		touches: MATERNITY_TOUCHES,
		hasTaxYear: true,
		amountHeading: 'Amount',
		compute: (f, asAt) => maternityPay({ weeklyEarnings: parseMoney(f.weeklyEarnings, '500', 100_000), taxYear: yearOf(f), asAt }),
	},
	'paternity-pay': {
		id: 'paternity-pay',
		fields: [
			{ id: 'weeklyEarnings', label: 'Average weekly earnings', type: 'money', unit: 'a week', default: '500', placeholder: '500', help: 'Before tax, averaged over the weeks an employer looks at before the qualifying week.' },
			{ id: 'weeks', label: 'Weeks of paternity pay', type: 'number', unit: 'weeks', default: '', help: 'Leave empty for the most the rules allow.' },
			taxYearField,
		],
		touches: PATERNITY_TOUCHES,
		hasTaxYear: true,
		amountHeading: 'Amount',
		compute: (f, asAt) => paternityPay({ weeklyEarnings: parseMoney(f.weeklyEarnings, '500', 100_000), weeks: parseNumber(f.weeks, '0', 52) || undefined, taxYear: yearOf(f), asAt }),
	},
};

export function defaultForm(tool: SimpleTool, overrides: Partial<SimpleForm> = {}): SimpleForm {
	const form: SimpleForm = {};
	for (const f of tool.fields) form[f.id] = overrides[f.id] ?? f.default;
	return form;
}

/** Keep only the fields the tool has, each as a string. */
function clean(tool: SimpleTool, raw: Record<string, unknown>): SimpleForm | null {
	const form: SimpleForm = {};
	for (const f of tool.fields) {
		const v = raw[f.id];
		if (v === undefined) {
			form[f.id] = f.default;
			continue;
		}
		if (typeof v !== 'string' || v.length > 40) return null;
		if (f.type === 'money' && !/^[\d,.]*$/.test(v)) return null;
		if (f.type === 'number' && !/^[\d,.]*$/.test(v)) return null;
		if (f.type === 'select' && !f.options?.some((o) => o.value === v)) return null;
		if (f.type === 'date' && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
		if (f.type === 'taxYear' && v !== '' && !/^\d{4}-\d{2}$/.test(v)) return null;
		form[f.id] = v;
	}
	return form;
}

const PREFIX = '#s=';

function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

export function encodeSimpleShare(tool: SimpleTool, form: SimpleForm): string {
	return PREFIX + toBase64Url(JSON.stringify(tool.fields.map((f) => form[f.id] ?? f.default)));
}

/** Decode a hash for a tool. Anything malformed gives null; nothing in it is executed or inserted as HTML. */
export function decodeSimpleShare(tool: SimpleTool, hash: string): SimpleForm | null {
	try {
		const m = /^#?s=([A-Za-z0-9_-]{1,600})$/.exec(hash);
		if (!m) return null;
		const data: unknown = JSON.parse(fromBase64Url(m[1]));
		if (!Array.isArray(data) || data.length !== tool.fields.length) return null;
		const raw: Record<string, unknown> = {};
		tool.fields.forEach((f, i) => (raw[f.id] = data[i]));
		return clean(tool, raw);
	} catch {
		return null;
	}
}

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

const storeKey = (tool: SimpleTool) => `mrh:inputs:${tool.id}:v1`;

export function loadSimpleSaved(tool: SimpleTool): SimpleForm | null {
	try {
		const raw = storage()?.getItem(storeKey(tool));
		return raw ? decodeSimpleShare(tool, PREFIX + raw) : null;
	} catch {
		return null;
	}
}

export function saveSimpleInputs(tool: SimpleTool, form: SimpleForm): void {
	try {
		storage()?.setItem(storeKey(tool), encodeSimpleShare(tool, form).slice(PREFIX.length));
	} catch {
		/* nothing saved */
	}
}

export function forgetSimpleInputs(tool: SimpleTool): void {
	try {
		storage()?.removeItem(storeKey(tool));
	} catch {
		/* nothing to forget */
	}
}
