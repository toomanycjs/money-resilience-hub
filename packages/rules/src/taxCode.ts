// Tax codes: L, M, N, T, K, BR, D0, D1, NT and 0T, with S and C prefixes
// and the W1, M1 and X suffixes stripped. Unknown codes fall back to the
// year's standard code with a visible note.

import { resolve } from './config.ts';
import { floorPound } from './rounding.ts';
import type { AllowanceResult, Nation, YearConfig } from './types.ts';

/** The standard code for a year, derived from the personal allowance (1257L for £12,570). */
export function defaultTaxCode(year: YearConfig, asAt: string): string {
	const pa = resolve(year.incomeTax.personalAllowance, 'incomeTax.personalAllowance', asAt).value;
	return `${Math.round(pa / 10)}L`;
}

export function normaliseTaxCode(raw: string | undefined): { code: string; prefix: 'S' | 'C' | null; nonCumulative: boolean } {
	let code = (raw ?? '').toUpperCase().replace(/\s+/g, '');
	let nonCumulative = false;
	const suffix = code.match(/(W1|M1|X)$/);
	if (suffix) {
		nonCumulative = true;
		code = code.slice(0, -suffix[1].length).replace(/\/$/, '');
	}
	let prefix: 'S' | 'C' | null = null;
	if (/^[SC](?=\d|BR|D|NT|K|0T)/.test(code)) {
		prefix = code[0] as 'S' | 'C';
		code = code.slice(1);
	}
	return { code, prefix, nonCumulative };
}

/**
 * The allowance a code gives before any taper, plus how the code behaves.
 * `gross` is only used to cap K-code tax later; the taper is applied by the caller.
 */
export function parseTaxCode(raw: string | undefined, year: YearConfig, nation: Nation, asAt: string): AllowanceResult {
	const fallback = defaultTaxCode(year, asAt);
	const { code, prefix, nonCumulative } = normaliseTaxCode(raw || fallback);
	const notes: string[] = [];
	if (nonCumulative) notes.push('The W1, M1 or X suffix means tax is worked out on each payslip alone. The annual figure here assumes a steady salary.');
	if (prefix === 'S' && nation !== 'scotland') notes.push('An S code means HMRC treats you as a Scottish taxpayer. The nation chosen here is used instead.');
	if (prefix === 'C' && nation !== 'wales') notes.push('A C code means HMRC treats you as a Welsh taxpayer. The nation chosen here is used instead.');

	const base = { code: raw ?? fallback, normalised: (prefix ?? '') + code, recognised: true, taperedBy: 0, kAddition: 0, notes };

	const flat = code.match(/^(BR|D0|D1|NT|0T)$/);
	if (flat) {
		const kind = flat[1] as 'BR' | 'D0' | 'D1' | 'NT' | '0T';
		return { ...base, kind, fromCode: 0, allowance: 0 };
	}
	const k = code.match(/^K(\d{1,5})$/);
	if (k) {
		return { ...base, kind: 'K', fromCode: 0, allowance: 0, kAddition: Number(k[1]) * 10 };
	}
	const m = code.match(/^(\d{1,5})([LMNT])$/);
	if (m) {
		return { ...base, kind: m[2] as 'L' | 'M' | 'N' | 'T', fromCode: Number(m[1]) * 10, allowance: Number(m[1]) * 10 };
	}
	// Unknown: use the standard code and say so.
	const std = normaliseTaxCode(fallback);
	const num = Number(std.code.match(/^(\d+)/)?.[1] ?? '0') * 10;
	return {
		...base,
		normalised: fallback,
		recognised: false,
		kind: 'L',
		fromCode: num,
		allowance: num,
		notes: [...notes, `${raw} is not a tax code this calculator recognises, so the standard code ${fallback} is used.`],
	};
}

/** Apply the £1 for every £2 taper above the start to an L-type allowance. */
export function taperAllowance(parsed: AllowanceResult, adjustedNetIncome: number, year: YearConfig, asAt: string): AllowanceResult {
	if (!['L', 'M', 'N', 'T'].includes(parsed.kind)) return parsed;
	const start = resolve(year.incomeTax.taperStart, 'incomeTax.taperStart', asAt).value;
	const rate = resolve(year.incomeTax.taperRate, 'incomeTax.taperRate', asAt).value;
	if (adjustedNetIncome <= start) return parsed;
	const reduction = Math.min(parsed.fromCode, floorPound((adjustedNetIncome - start) * rate));
	return { ...parsed, allowance: parsed.fromCode - reduction, taperedBy: reduction };
}
