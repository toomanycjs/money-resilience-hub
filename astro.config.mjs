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
	integrations: [mdx(), sitemaps(), linkCheck(), indexNow({ key: 'a7c3f0e1b94d4e2f8c6a5b1d3e7f9a0c' })],
	vite: {
		ssr: { noExternal: ['@money-resilience-hub/rules', '@money-resilience-hub/calculators'] },
	},
});
