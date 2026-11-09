// The feed: guides as they are published or reviewed, corrections as they
// are logged, and the dated entries in src/data/updates.json (new pages and
// changes to the rates). Newest first.

import rss from '@astrojs/rss';
import corrections from '../../docs/corrections.json' with { type: 'json' };
import updates from '../data/updates.json' with { type: 'json' };
import { SITE_DESCRIPTION, SITE_NAME } from '../config/site';
import { GUIDES } from '../lib/guides';

// Midday UTC, so the date reads the same in every time zone.
const at = (date) => new Date(`${date}T12:00:00Z`);

export async function GET(context) {
	const items = [
		...GUIDES.map((g) => ({ title: g.h1, description: g.description, pubDate: at(g.published), link: `/guides/${g.slug}/` })),
		...updates.map((u) => ({ title: u.title, description: u.description, pubDate: at(u.date), link: u.link })),
		...corrections.map((c) => ({ title: `Correction: ${c.page}`, description: `${c.wrong} Change: ${c.change}.`, pubDate: at(c.date), link: `/corrections/#${c.fixture ?? c.date}` })),
	].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
	return rss({ title: SITE_NAME, description: SITE_DESCRIPTION, site: context.site, items });
}
