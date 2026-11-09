// Nothing a person types into a calculator can reach analytics: the address
// reported for a page never carries the hash (where share links keep inputs)
// or the query string.

import { describe, expect, it } from 'vitest';
import { browserOptedOut, pageLocation } from '../src/scripts/analytics';

describe('analytics', () => {
	it('reports the origin and path only', () => {
		expect(pageLocation('https://www.moneyresiliencehub.co.uk/calculators/take-home-pay/#s=WyI1NTAwMCJd')).toBe('https://www.moneyresiliencehub.co.uk/calculators/take-home-pay/');
		expect(pageLocation('https://www.moneyresiliencehub.co.uk/salary/30000/?gross=55000#s=abc')).toBe('https://www.moneyresiliencehub.co.uk/salary/30000/');
	});
	it('gives nothing for a malformed address', () => {
		expect(pageLocation('not a url')).toBe('');
	});
	it('respects Do Not Track and Global Privacy Control', () => {
		expect(browserOptedOut({ doNotTrack: '1' })).toBe(true);
		expect(browserOptedOut({ globalPrivacyControl: true })).toBe(true);
		expect(browserOptedOut({ doNotTrack: null })).toBe(false);
	});
});
