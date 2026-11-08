import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Guides: the articles around each calculator. Every figure in a guide is
// computed at build time or cited to a data file; the frontmatter carries
// the question, the dates and the three hand-picked links.
const guides = defineCollection({
	loader: glob({ base: './src/content/guides', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		reviewedOn: z.coerce.date().optional(),
		hub: z.string(),
		related: z.array(z.object({ title: z.string(), href: z.string() })).length(3),
		draft: z.boolean().default(false),
	}),
});

export const collections = { guides };
