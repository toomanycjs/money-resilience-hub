// One sitemap per family (pages, calculators, salary, hourly, monthly,
// guides, rates) so Search Console reports indexing by family, plus the
// index. lastmod comes from src/lib/lastmod.mjs: it moves only when the
// page's text or a figure it renders changes.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastmodFor } from '../lib/lastmod.mjs';

function htmlFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = join(dir, d.name);
		return d.isDirectory() ? htmlFiles(p) : d.name.endsWith('.html') ? [p] : [];
	});
}

const FAMILIES = ['calculators', 'salary', 'hourly', 'monthly', 'guides', 'rates'];

export default function sitemaps() {
	let site;
	return {
		name: 'sitemaps',
		hooks: {
			'astro:config:done': ({ config }) => {
				site = config.site;
			},
			'astro:build:done': ({ dir, logger }) => {
				const root = fileURLToPath(dir);
				const byFamily = new Map(['pages', ...FAMILIES].map((f) => [f, []]));
				for (const file of htmlFiles(root)) {
					const rel = file.slice(root.length).replace(/\\/g, '/').replace(/^\//, '');
					if (rel === '404.html' || rel.startsWith('design/')) continue;
					const html = readFileSync(file, 'utf8');
					if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
					const path = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '');
					const years = [...html.matchAll(/data-tax-year="(\d{4}-\d{2})"/g)].map((m) => m[1]);
					const family = FAMILIES.find((f) => path.startsWith(`/${f}/`)) ?? 'pages';
					byFamily.get(family).push({ loc: new URL(path, site).href, lastmod: lastmodFor(path, years) });
				}
				const names = [];
				for (const [family, urls] of byFamily) {
					if (!urls.length) continue;
					const name = `sitemap-${family}.xml`;
					names.push(name);
					const body = urls
						.sort((a, b) => a.loc.localeCompare(b.loc))
						.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
						.join('\n');
					writeFileSync(join(root, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
				}
				const index = names.map((n) => `  <sitemap><loc>${new URL('/' + n, site).href}</loc></sitemap>`).join('\n');
				writeFileSync(join(root, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index}\n</sitemapindex>\n`);
				logger.info(`wrote ${names.length} family sitemap(s)`);
			},
		},
	};
}
