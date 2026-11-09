// Nothing is counted without consent, and nothing a person types into a
// calculator can reach analytics: the address reported for a page never
// carries the hash (where share links keep inputs) or the query string.

import { describe, expect, it } from 'vitest';
import { CONSENT_KEY, pageLocation, readConsent, writeConsent } from '../src/scripts/analytics';

function fakeStorage(initial: Record<string, string> = {}) {
	const data = { ...initial };
	return {
		getItem: (k: string) => (k in data ? data[k] : null),
		setItem: (k: string, v: string) => {
			data[k] = v;
		},
		removeItem: (k: string) => {
			delete data[k];
		},
	};
}

describe('consent', () => {
	it('is null until the visitor chooses', () => {
		expect(readConsent(fakeStorage())).toBeNull();
		expect(readConsent(null)).toBeNull();
	});
	it('stores and reads back a choice', () => {
		const s = fakeStorage();
		writeConsent('rejected', s);
		expect(readConsent(s)).toBe('rejected');
		writeConsent('accepted', s);
		expect(readConsent(s)).toBe('accepted');
	});
	it('treats anything unexpected as no choice', () => {
		expect(readConsent(fakeStorage({ [CONSENT_KEY]: 'yes please' }))).toBeNull();
	});
});

describe('page address sent to analytics', () => {
	it('is the origin and path only', () => {
		expect(pageLocation('https://www.moneyresiliencehub.co.uk/calculators/take-home-pay/#s=WyI1NTAwMCJd')).toBe('https://www.moneyresiliencehub.co.uk/calculators/take-home-pay/');
		expect(pageLocation('https://www.moneyresiliencehub.co.uk/salary/30000/?gross=55000#s=abc')).toBe('https://www.moneyresiliencehub.co.uk/salary/30000/');
	});
	it('is empty for a malformed address', () => {
		expect(pageLocation('not a url')).toBe('');
	});
});
