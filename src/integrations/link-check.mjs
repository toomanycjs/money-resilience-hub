// Fails the build if an internal link drops its trailing slash or points at
// a page that was not built, and if any page outside the nav is linked from
// fewer than two other pages (an orphan).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function htmlFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = join(dir, d.name);
		return d.isDirectory() ? htmlFiles(p) : d.name.endsWith('.html') ? [p] : [];
	});
}

const NO_SLASH = /href="(\/(?:[^"#?/.]+\/)*[^"#?/.]+)(?:[#?][^"]*)?"/g;
const PAGE = /href="(\/(?:[^"#?/.]+\/)*)(?:[#?][^"]*)?"/g;

export default function linkCheck() {
	return {
		name: 'link-check',
		hooks: {
			'astro:build:done': ({ dir, logger }) => {
				const root = fileURLToPath(dir);
				const problems = [];
				const files = htmlFiles(root);
				const pageOf = (f) => '/' + f.slice(root.length).replace(/\\/g, '/').replace(/^\/|index\.html$/g, '');
				const built = new Set(files.map(pageOf));
				const inbound = new Map();
				for (const file of files) {
					const page = pageOf(file);
					if (page === '/404.html' || page.startsWith('/design/')) continue;
					const html = readFileSync(file, 'utf8');
					// Draft pages are built for review only and count towards nothing.
					if (page.startsWith('/drafts/')) {
						for (const [, href] of html.matchAll(PAGE)) if (!built.has(href)) problems.push(`${page} links to ${href}, which is not a built page`);
						continue;
					}
					// Links in the body, not the header nav, count towards orphan checks.
					const body = html.replace(/<header[\s\S]*?<\/header>/i, '');
					for (const [, href] of html.matchAll(NO_SLASH)) problems.push(`${page} links to ${href} without a trailing slash`);
					for (const [, href] of html.matchAll(PAGE)) if (!built.has(href)) problems.push(`${page} links to ${href}, which is not a built page`);
					const seen = new Set();
					for (const [, href] of body.matchAll(PAGE)) {
						if (href === page || seen.has(href)) continue;
						seen.add(href);
						inbound.set(href, (inbound.get(href) ?? 0) + 1);
					}
				}
				for (const page of built) {
					if (page === '/404.html' || page === '/' || page.startsWith('/design/') || page.startsWith('/drafts/')) continue;
					const n = inbound.get(page) ?? 0;
					if (n < 2) problems.push(`${page} is linked from ${n} other page(s); every page needs at least two`);
				}
				if (problems.length) throw new Error(`link check failed:\n  ${problems.join('\n  ')}`);
				logger.info(`${built.size} pages, no slashless links, no missing targets, no orphans`);
			},
		},
	};
}
