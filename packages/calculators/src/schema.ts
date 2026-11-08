// The take-home calculator's inputs: what the form asks, how a record of
// strings becomes a TakeHomeInput, and the defaults.

import { NATIONS, NATION_LABEL, PENSION_LABEL, PLANS, PLAN_LABEL, type Nation, type PensionType, type Plan, type TakeHomeInput } from '@money-resilience-hub/rules';

export interface FieldOption {
	value: string;
	label: string;
}

export interface Field {
	id: string;
	label: string;
	type: 'money' | 'select' | 'text' | 'checkboxes' | 'percent';
	help?: string;
	options?: FieldOption[];
	default: string | string[];
	/** Text shown after the control, e.g. "a year". */
	unit?: string;
	placeholder?: string;
}

export const TAKE_HOME_FIELDS: Field[] = [
	{ id: 'gross', label: 'Salary', type: 'money', unit: 'a year', default: '30000', placeholder: '30000' },
	{ id: 'nation', label: 'Where you live', type: 'select', options: NATIONS.map((n) => ({ value: n, label: NATION_LABEL[n] })), default: 'england-ni' },
	{ id: 'taxCode', label: 'Tax code', type: 'text', help: 'From your payslip. Leave it as it is if you are not sure.', default: '', placeholder: '1257L' },
	{ id: 'studentLoanPlans', label: 'Student loan', type: 'checkboxes', options: PLANS.map((p) => ({ value: p, label: PLAN_LABEL[p] })), default: [] },
	{ id: 'pensionType', label: 'Pension', type: 'select', options: [{ value: '', label: 'None' }, ...(Object.keys(PENSION_LABEL) as PensionType[]).map((p) => ({ value: p, label: PENSION_LABEL[p] }))], default: '', help: 'Your scheme type is on your pension statement or payslip.' },
	{ id: 'pensionPercent', label: 'Pension contribution', type: 'percent', unit: '% of salary', default: '5' },
];

export interface TakeHomeForm {
	gross: string;
	nation: string;
	taxCode: string;
	studentLoanPlans: string[];
	pensionType: string;
	pensionPercent: string;
	taxYear?: string;
}

export const DEFAULT_FORM: TakeHomeForm = { gross: '30000', nation: 'england-ni', taxCode: '', studentLoanPlans: [], pensionType: '', pensionPercent: '5' };

export function isNation(x: unknown): x is Nation {
	return typeof x === 'string' && (NATIONS as string[]).includes(x);
}
export function isPlan(x: unknown): x is Plan {
	return typeof x === 'string' && (PLANS as string[]).includes(x);
}
export function isPensionType(x: unknown): x is PensionType {
	return typeof x === 'string' && x in PENSION_LABEL;
}

/** Parse a form record into engine input. Bad values fall back to defaults, never throw. */
export function parseForm(form: Partial<TakeHomeForm>, asAt: string): TakeHomeInput {
	const grossRaw = String(form.gross ?? DEFAULT_FORM.gross).replace(/[£,\s]/g, '');
	const gross = Math.min(10_000_000, Math.max(0, Number(grossRaw) || 0));
	const nation = isNation(form.nation) ? form.nation : 'england-ni';
	const taxCode = String(form.taxCode ?? '').trim().slice(0, 12) || undefined;
	const plans = (Array.isArray(form.studentLoanPlans) ? form.studentLoanPlans : []).filter(isPlan);
	const pct = Math.min(100, Math.max(0, Number(form.pensionPercent) || 0));
	const pension = isPensionType(form.pensionType) && pct > 0 ? { type: form.pensionType, percent: pct } : null;
	const input: TakeHomeInput = { gross, nation, taxCode, studentLoanPlans: plans, pension, asAt };
	if (form.taxYear && /^\d{4}-\d{2}$/.test(form.taxYear)) input.taxYear = form.taxYear;
	return input;
}

/** The form values for an engine input, for pre-filling. */
export function formFromInput(input: Partial<TakeHomeInput>): TakeHomeForm {
	return {
		gross: input.gross != null ? String(Math.round(input.gross)) : DEFAULT_FORM.gross,
		nation: input.nation ?? DEFAULT_FORM.nation,
		taxCode: input.taxCode ?? '',
		studentLoanPlans: [...(input.studentLoanPlans ?? [])],
		pensionType: input.pension?.type ?? '',
		pensionPercent: input.pension?.percent != null ? String(input.pension.percent) : DEFAULT_FORM.pensionPercent,
		taxYear: input.taxYear,
	};
}
