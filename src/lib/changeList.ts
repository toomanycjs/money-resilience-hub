// The lists of what differs between two tax years, for the rates pages and
// the fiscal event pages. Every row has a plain label, the same precision
// and units as the rates tables, and its source. A value with nothing
// recorded for the earlier year is not shown as a change, and a value not
// yet set for the later year is listed separately.

import { compareYears, pathLabel, type Nation, type Status, type YearConfig } from '@money-resilience-hub/rules';
import { LABELS, formatRateValue } from './rates.ts';

export interface ChangeRow {
	path: string;
	label: string;
	from: string;
	to: string;
	status: Status;
	source: string;
	verified: string;
}

export interface ChangeList {
	/** Recorded in both years and different. */
	changed: ChangeRow[];
	/** Recorded for the later year only, so there is nothing to compare with. */
	notCompared: { path: string; label: string; value: string }[];
	/** Recorded for the earlier year but not yet set for the later one. */
	notYetSet: { path: string; label: string; was: string }[];
}

const NATION_ADJECTIVE: Record<Nation, string> = { 'england-ni': 'England and Northern Ireland', scotland: 'Scottish', wales: 'Welsh' };

/** A plain label for a config path: "Scottish starter rate band, top" rather than a data key. */
export function labelFor(path: string, year: YearConfig): string {
	const band = path.match(/^incomeTax\.bands\.([a-z-]+)\[(\d+)\]\.(upTo|rate)$/);
	if (band) {
		const nation = band[1] as Nation;
		const name = year.incomeTax.bands[nation]?.[Number(band[2])]?.name ?? `band ${Number(band[2]) + 1}`;
		return `${NATION_ADJECTIVE[nation]} ${name.toLowerCase()}${band[3] === 'upTo' ? ' band, top' : ''}`;
	}
	if (LABELS[path]) return LABELS[path];
	const fromEngine = pathLabel(path);
	if (fromEngine !== path) return fromEngine.replace(/^the /, '').replace(/^(.)/, (m) => m.toUpperCase());
	// Last resort: turn the key into words rather than show it raw.
	return path
		.split('.')
		.slice(-2)
		.join(' ')
		.replace(/([A-Z])/g, ' $1')
		.replace(/\[(\d+)\]/g, ' $1')
		.toLowerCase()
		.replace(/^(.)/, (m) => m.toUpperCase());
}

/** A value in the same form the rates tables use. Band limits are money, band rates are percentages. */
export function formatFor(path: string, value: number | string | null): string {
	if (/\.upTo$/.test(path)) return formatRateValue('incomeTax.personalAllowance', value);
	if (/\]\.rate$/.test(path)) return formatRateValue('incomeTax.savings.rates.basic', value);
	return formatRateValue(path, value);
}

export function changeList(from: YearConfig, to: YearConfig): ChangeList {
	const out: ChangeList = { changed: [], notCompared: [], notYetSet: [] };
	for (const c of compareYears(from, to)) {
		if (typeof c.from === 'object' && c.from !== null) continue;
		if (typeof c.to === 'object' && c.to !== null) continue;
		const label = labelFor(c.path, c.to === null ? from : to);
		if (c.from === null && c.to === null) continue;
		if (c.from === null) {
			out.notCompared.push({ path: c.path, label, value: formatFor(c.path, c.to) });
			continue;
		}
		if (c.to === null) {
			out.notYetSet.push({ path: c.path, label, was: formatFor(c.path, c.from) });
			continue;
		}
		const a = formatFor(c.path, c.from);
		const b = formatFor(c.path, c.to);
		if (a === b) continue;
		out.changed.push({ path: c.path, label, from: a, to: b, status: c.status as Status, source: c.source, verified: c.verified });
	}
	return out;
}
