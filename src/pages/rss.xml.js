import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION, SITE_NAME } from '../config/site';

export async function GET(context) {
	const guides = (await getCollection('guides', (g) => !g.data.draft)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
	return rss({
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: guides.map((g) => ({ title: g.data.title, description: g.data.description, pubDate: g.data.pubDate, link: `/guides/${g.id}/` })),
	});
}
