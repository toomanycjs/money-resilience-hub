import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, parseForm, DEFAULT_FORM } from '../packages/calculators/src/index';

describe('share links', () => {
	it('round-trips a form through the hash', () => {
		const form = { ...DEFAULT_FORM, gross: '45000', nation: 'scotland', taxCode: 'S1257L', studentLoanPlans: ['plan4', 'postgraduate'], pensionType: 'salary-sacrifice', pensionPercent: '6', taxYear: '2026-27' };
		const hash = encodeShare(form);
		expect(hash.startsWith('#s=')).toBe(true);
		expect(decodeShare(hash)).toEqual(form);
	});
	it('rejects anything malformed', () => {
		expect(decodeShare('#s=not-base64!')).toBeNull();
		expect(decodeShare('#s=' + btoa(JSON.stringify(['1', 'mars', '', [], '', '5'])).replace(/=+$/, ''))).toBeNull();
		expect(decodeShare('#r=abc')).toBeNull();
	});
	it('parses a form into engine input without throwing on bad values', () => {
		const input = parseForm({ gross: '£40,000', nation: 'nowhere', taxCode: 'x'.repeat(50), studentLoanPlans: ['plan9', 'plan2'], pensionType: 'magic', pensionPercent: '200' }, '2026-11-07');
		expect(input.gross).toBe(40000);
		expect(input.nation).toBe('england-ni');
		expect(input.taxCode?.length).toBe(12);
		expect(input.studentLoanPlans).toEqual(['plan2']);
		expect(input.pension).toBeNull();
	});
});
