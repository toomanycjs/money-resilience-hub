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
