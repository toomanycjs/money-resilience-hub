// Share links carry the inputs in the URL hash, which never leaves the
// browser: it is not sent to the server, to analytics or to any ad request.
// Saved inputs live in localStorage under one key and are never sent anywhere.

import { DEFAULT_FORM, isNation, isPensionType, isPlan, type TakeHomeForm } from './schema.ts';

export const SHARE_PREFIX = '#s=';
export const STORE_KEY = 'mrh:inputs:v1';
export const ANALYTICS_OPT_OUT_KEY = 'mrh:analytics';

type Compact = [string, string, string, string[], string, string, string?];

function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const bin = atob(b64);
	return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeShare(form: TakeHomeForm): string {
	const c: Compact = [form.gross, form.nation, form.taxCode, form.studentLoanPlans, form.pensionType, form.pensionPercent];
	if (form.taxYear) c.push(form.taxYear);
	return SHARE_PREFIX + toBase64Url(JSON.stringify(c));
}

/** Decode a hash. Anything malformed gives null; nothing in it is ever executed or inserted as HTML. */
export function decodeShare(hash: string): TakeHomeForm | null {
	try {
		const m = /^#?s=([A-Za-z0-9_-]{1,400})$/.exec(hash);
		if (!m) return null;
		const data: unknown = JSON.parse(fromBase64Url(m[1]));
		if (!Array.isArray(data) || data.length < 6) return null;
		const [gross, nation, taxCode, plans, pensionType, pensionPercent, taxYear] = data as unknown[];
		if (typeof gross !== 'string' || !/^\d{0,8}$/.test(gross)) return null;
		if (!isNation(nation)) return null;
		if (typeof taxCode !== 'string' || taxCode.length > 12) return null;
		if (!Array.isArray(plans) || !plans.every(isPlan)) return null;
		if (pensionType !== '' && !isPensionType(pensionType)) return null;
		if (typeof pensionPercent !== 'string' || !/^\d{0,3}(\.\d{1,2})?$/.test(pensionPercent)) return null;
		const form: TakeHomeForm = { gross, nation, taxCode, studentLoanPlans: plans, pensionType: pensionType as string, pensionPercent };
		if (typeof taxYear === 'string' && /^\d{4}-\d{2}$/.test(taxYear)) form.taxYear = taxYear;
		return form;
	} catch {
		return null;
	}
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

export function loadSaved(): TakeHomeForm | null {
	try {
		const raw = storage()?.getItem(STORE_KEY);
		if (!raw) return null;
		const form = decodeShare('#s=' + raw);
		return form;
	} catch {
		return null;
	}
}

export function saveInputs(form: TakeHomeForm): boolean {
	try {
		storage()?.setItem(STORE_KEY, encodeShare(form).slice(SHARE_PREFIX.length));
		return true;
	} catch {
		return false;
	}
}

export function forgetInputs(): void {
	try {
		storage()?.removeItem(STORE_KEY);
	} catch {
		/* nothing to forget */
	}
}

export { DEFAULT_FORM };
