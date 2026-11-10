// The open data files behind the guides, served from src/data. A file is
// published only when a page on the live site uses it, so a draft's data
// stays private until the draft goes live; with DRAFTS=1 the drafts' files
// are built too, for review.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
	existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])) : [];

export function getStaticPaths() {
	const pages = [...walk('src/pages'), ...(process.env.DRAFTS === '1' ? walk('src/drafts') : [])].filter((f) => f.endsWith('.astro'));
	const used = new Set<string>();
	for (const file of pages) for (const m of readFileSync(file, 'utf8').matchAll(/data\/([a-z0-9-]+)\.json/g)) used.add(m[1]);
	return [...used].filter((name) => existsSync(`src/data/${name}.json`)).map((name) => ({ params: { name } }));
}

export function GET({ params }: { params: { name: string } }) {
	return new Response(readFileSync(`src/data/${params.name}.json`), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
