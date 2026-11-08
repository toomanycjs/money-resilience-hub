// Nothing a person types into a calculator can reach an analytics payload.

import { describe, expect, it } from 'vitest';
import { buildHit } from '../src/scripts/analytics';

describe('analytics payload', () => {
	it('strips the hash and query from the path', () => {
		const hit = buildHit('/calculators/take-home-pay/#s=abc?x=1', '', 400);
		expect(hit.p).toBe('/calculators/take-home-pay/');
	});
	it('carries input names, never values', () => {
		const hit = buildHit('/x/', '', 1200, ['gross', 'nation', '30000', 'taxCode=K475']);
		expect(hit.i).toEqual(['gross', 'nation']);
	});
	it('only ever has the allowed keys', () => {
		const hit = buildHit('/x/', 'https://example.org/page', 800, []);
		expect(Object.keys(hit).sort()).toEqual(['p', 'r', 'w']);
		expect(hit.r).toBe('example.org');
	});
});
