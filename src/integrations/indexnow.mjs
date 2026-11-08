// @ts-check
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MANIFEST = 'indexnow-manifest.json';

/**
 * Submits new and updated pages to IndexNow (Bing, Yandex, and other
 * participating engines) at the end of each production build.
 *
 * Change detection works without any persistent build state: every build
 * writes a manifest of page-URL → HTML-hash into dist, which gets deployed
 * with the site. The next build fetches that manifest from the live site and
 * submits only the URLs whose hash is new or different.
 *
 * Submission only happens on Vercel production builds (VERCEL_ENV=production)
 * or when INDEXNOW_SUBMIT=1 is set; other builds log a dry run.
 *
 * @param {{ key: string }} options - IndexNow key. The key file Bing checks
 *   (/<key>.txt) is generated into dist automatically, so the key in
 *   astro.config.mjs is the single source of truth.
 * @returns {import('astro').AstroIntegration}
 */
export default function indexNow({ key }) {
	/** @type {URL | undefined} */
	let site;

	return {
		name: 'indexnow',
		hooks: {
			'astro:config:done': ({ config }) => {
				if (config.site) site = new URL(config.site);
			},
			'astro:build:done': async ({ dir, logger }) => {
				if (!site) {
					logger.warn('`site` is not set in astro.config; skipping IndexNow');
					return;
				}
				const distDir = fileURLToPath(dir);

				try {
					await writeFile(path.join(distDir, `${key}.txt`), key);

					const manifest = {};
					for (const file of await htmlFiles(distDir)) {
						const rel = path.relative(distDir, file).split(path.sep).join('/');
						if (rel === '404.html') continue;
						const urlPath = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '');
						const html = await readFile(file);
						// Pages that ask not to be indexed (e.g. /tools/my-results/) are not submitted.
						if (/<meta name="robots" content="noindex/i.test(html.toString())) continue;
						manifest[new URL(urlPath, site).href] = createHash('sha256').update(html).digest('hex');
					}

					await writeFile(path.join(distDir, MANIFEST), JSON.stringify(manifest, null, '\t'));

					// Builds that can't submit skip the network entirely: it keeps local
					// builds fast, and avoids a Windows-only crash on process teardown
					// when native image work and a completed request unwind together.
					const submitting = process.env.VERCEL_ENV === 'production' || process.env.INDEXNOW_SUBMIT === '1';
					const previewing = process.env.INDEXNOW_DRY_RUN === '1';
					if (!submitting && !previewing) {
						const count = Object.keys(manifest).length;
						logger.info(`manifest written for ${count} page(s); set INDEXNOW_DRY_RUN=1 to preview what would be submitted`);
						return;
					}

					let previous = {};
					try {
						const res = await fetch(new URL(`/${MANIFEST}`, site), { signal: AbortSignal.timeout(10_000) });
						if (res.ok) {
							previous = await res.json();
						} else {
							await res.body?.cancel();
							logger.warn(`no previous manifest on the live site (HTTP ${res.status}); treating all pages as new`);
						}
					} catch (err) {
						logger.warn(`could not fetch previous manifest (${err.message}); treating all pages as new`);
					}

					const changed = Object.keys(manifest).filter((url) => previous[url] !== manifest[url]);
					if (changed.length === 0) {
						logger.info('no new or updated pages; nothing to submit');
						return;
					}

					if (!submitting) {
						logger.info(`dry run: ${changed.length} page(s) would be submitted:`);
						for (const url of changed) logger.info(`  ${url}`);
						return;
					}

					try {
						const res = await fetch(ENDPOINT, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json; charset=utf-8' },
							body: JSON.stringify({
								host: site.hostname,
								key,
								keyLocation: new URL(`/${key}.txt`, site).href,
								urlList: changed,
							}),
							signal: AbortSignal.timeout(15_000),
						});
						const body = await res.text();
						if (res.ok) {
							logger.info(`submitted ${changed.length} URL(s) to IndexNow (HTTP ${res.status})`);
						} else {
							logger.warn(`IndexNow submission failed: HTTP ${res.status} ${body}`);
						}
					} catch (err) {
						logger.warn(`IndexNow submission failed: ${err.message}`);
					}
				} finally {
					await closeConnectionPool();
				}
			},
		},
	};
}

/**
 * `fetch` keeps its connections pooled, which leaves a handle open and stops the
 * build process exiting cleanly once the build itself has finished. Closing the
 * pool is best-effort: it must never break a build that otherwise succeeded.
 */
async function closeConnectionPool() {
	try {
		await globalThis[Symbol.for('undici.globalDispatcher.1')]?.close?.();
	} catch {
		// nothing to close, or a Node version that manages the pool differently
	}
}

/**
 * @param {string} dirPath
 * @param {string[]} out
 * @returns {Promise<string[]>}
 */
async function htmlFiles(dirPath, out = []) {
	for (const entry of await readdir(dirPath, { withFileTypes: true })) {
		const full = path.join(dirPath, entry.name);
		if (entry.isDirectory()) await htmlFiles(full, out);
		else if (entry.name.endsWith('.html')) out.push(full);
	}
	return out;
}
