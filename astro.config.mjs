// @ts-check

import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';
import indexNow from './src/integrations/indexnow.mjs';
import linkCheck from './src/integrations/link-check.mjs';
import sitemaps from './src/integrations/sitemaps.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.moneyresiliencehub.co.uk',
	trailingSlash: 'always',
	build: { inlineStylesheets: 'auto' },
	integrations: [mdx(), sitemaps(), linkCheck(), indexNow({ key: 'b4409f9af2dc573f9bc07bcb8a18a82c' })],
	vite: {
		// Every script is a file of its own: the Content-Security-Policy in vercel.json allows no inline script.
		build: { assetsInlineLimit: 0 },
		ssr: { noExternal: ['@money-resilience-hub/rules', '@money-resilience-hub/calculators'] },
	},
});
