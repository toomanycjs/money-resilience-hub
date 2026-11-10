// pnpm draft:publish <slug> [date]
// Moves a draft guide from src/drafts/guides to src/pages/guides and marks
// its registry entry as published on the date given (default: today), so
// the next build puts it in the index, the feed and the share cards.
// Run `pnpm build`, review, then commit and push to make it live.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const [slug, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!slug) {
	console.error('usage: node scripts/publish-draft.mjs <slug> [YYYY-MM-DD]');
	process.exit(1);
}
const from = `src/drafts/guides/${slug}.astro`;
const to = `src/pages/guides/${slug}.astro`;
if (!existsSync(from)) {
	console.error(`${from} does not exist`);
	process.exit(1);
}
if (existsSync(to)) {
	console.error(`${to} already exists`);
	process.exit(1);
}

const registry = 'src/lib/guides.ts';
let src = readFileSync(registry, 'utf8');
const start = src.indexOf(`slug: '${slug}'`);
if (start < 0) {
	console.error(`${slug} is not registered in ${registry}`);
	process.exit(1);
}
const end = src.indexOf('\n\t},', start);
let entry = src.slice(start, end);
if (!/draft: true/.test(entry)) {
	console.error(`${slug} is not marked as a draft`);
	process.exit(1);
}
entry = entry
	.replace(/\n\t\tdraft: true,/, '')
	.replace(/\n\t\tpublishOn: '[^']*',/, '')
	.replace(/published: [^,]+,/, `published: '${date}',`)
	.replace(/reviewedOn: [^,]+,/, `reviewedOn: '${date}',`);
src = src.slice(0, start) + entry + src.slice(end);
writeFileSync(registry, src);
renameSync(from, to);
console.log(`${slug}: moved to ${to}, published ${date}. Now: corepack pnpm build, review, commit, push.`);
