// The site's page registry: which salary pages are live (from config/waves.json),
// the static pages for the share images and sitemaps, and the families each
// sitemap lists.

import waves from '../../config/waves.json' with { type: 'json' };

export type Family = 'pages' | 'calculators' | 'salary' | 'hourly' | 'monthly' | 'guides' | 'rates';

export interface WaveConfig {
	salary: { wave: number; waves: number[][] };
	hourly: { wave: number; waves: number[][] };
	monthly: { wave: number; waves: number[][] };
}

const cfg = waves as WaveConfig;

/** Amounts live for a family: every wave up to and including the current one. */
export function liveAmounts(family: 'salary' | 'hourly' | 'monthly'): number[] {
	const f = cfg[family];
	return f.waves.slice(0, f.wave).flat().sort((a, b) => a - b);
}

export function currentWave(family: 'salary' | 'hourly' | 'monthly'): number {
	return cfg[family].wave;
}

/** The pages £1,000 either side that are live, or the nearest live neighbours. */
export function neighbours(family: 'salary' | 'hourly' | 'monthly', amount: number): { below: number | null; above: number | null } {
	const live = liveAmounts(family);
	const below = [...live].reverse().find((a) => a < amount) ?? null;
	const above = live.find((a) => a > amount) ?? null;
	return { below, above };
}

/** The working week the hourly pages assume, and the weeks in a year. */
export const HOURS_PER_WEEK = 37.5;
export const WEEKS_PER_YEAR = 52;

/** The annual salary an hourly rate gives on the standard week. */
export function salaryForHourly(rate: number, hours = HOURS_PER_WEEK): number {
	return Math.round(rate * hours * WEEKS_PER_YEAR);
}

/** The annual salary a monthly pay before tax gives. */
export function salaryForMonthlyPay(monthly: number): number {
	return monthly * 12;
}

/** The salaries that sit on a threshold of the tax system rather than a round thousand. */
export function thresholdAmounts(): number[] {
	return liveAmounts('salary').filter((a) => a % 1000 !== 0);
}

export function familyOf(pathname: string): Family {
	const first = pathname.split('/').filter(Boolean)[0];
	if (first === 'calculators') return 'calculators';
	if (first === 'salary') return 'salary';
	if (first === 'hourly') return 'hourly';
	if (first === 'monthly') return 'monthly';
	if (first === 'guides') return 'guides';
	if (first === 'rates') return 'rates';
	return 'pages';
}
