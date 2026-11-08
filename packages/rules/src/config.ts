// Loads the tax year configs and resolves a value as at a date.

import y2526 from '../config/2025-26.json' with { type: 'json' };
import y2627 from '../config/2026-27.json' with { type: 'json' };
import y2728 from '../config/2027-28.json' with { type: 'json' };
import { RulesUnavailableError, type Leaf, type Provenance, type Status, type YearConfig } from './types.ts';

const YEARS: YearConfig[] = [y2526, y2627, y2728].map((y) => y as unknown as YearConfig).sort((a, b) => a.starts.localeCompare(b.starts));

export function listYears(): YearConfig[] {
	return YEARS;
}

export function getYear(taxYear: string): YearConfig {
	const y = YEARS.find((c) => c.taxYear === taxYear);
	if (!y) throw new Error(`No rules config for tax year ${taxYear}`);
	return y;
}

/** The tax year containing an ISO date. */
export function yearFor(isoDate: string): YearConfig {
	const y = YEARS.find((c) => isoDate >= c.starts && isoDate <= c.ends);
	if (!y) throw new Error(`No rules config covers ${isoDate}`);
	return y;
}

export function previousYear(taxYear: string): YearConfig | null {
	const i = YEARS.findIndex((c) => c.taxYear === taxYear);
	return i > 0 ? YEARS[i - 1] : null;
}

export function nextYear(taxYear: string): YearConfig | null {
	const i = YEARS.findIndex((c) => c.taxYear === taxYear);
	return i >= 0 && i < YEARS.length - 1 ? YEARS[i + 1] : null;
}

export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * The value of a leaf as at a date. A leaf with an effectiveFrom later than
 * the date falls back to its `previous` value. A leaf with no value throws,
 * so a tool can say the rule is not yet set rather than guessing.
 */
export function resolve<T>(leaf: Leaf<T>, path: string, asAt: string): { value: T; provenance: Provenance } {
	if (leaf.effectiveFrom && asAt < leaf.effectiveFrom) {
		if (leaf.previous) return resolve(leaf.previous, `${path}.previous`, asAt);
		throw new RulesUnavailableError(`${path} applies from ${leaf.effectiveFrom}; no earlier value is recorded`, path);
	}
	if (leaf.value === null || leaf.value === undefined) {
		throw new RulesUnavailableError(leaf.note ? `${path}: ${leaf.note}` : `${path} has not been set`, path);
	}
	return { value: leaf.value, provenance: provenanceOf(leaf) };
}

export function provenanceOf(leaf: { source: string; verified: string; status: Status; note?: string }): Provenance {
	const p: Provenance = { source: leaf.source, verified: leaf.verified, status: leaf.status };
	if (leaf.note) p.note = leaf.note;
	return p;
}

/** Order of certainty, least settled first. */
export const STATUS_ORDER: Status[] = ['unset', 'announced', 'legislated', 'in-force'];

export function leastSettled(statuses: Status[]): Status {
	return statuses.reduce<Status>((worst, s) => (STATUS_ORDER.indexOf(s) < STATUS_ORDER.indexOf(worst) ? s : worst), 'in-force');
}
