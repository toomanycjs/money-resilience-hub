// Structured data, built in the layouts so no page hand-writes JSON-LD.
// BreadcrumbList everywhere, WebSite and Organization on the home page,
// FAQPage only where the questions are visible, Article on guides.
// No AggregateRating, no reviews.

import { AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '../config/site';

type Node = Record<string, unknown>;

export interface FaqPair {
	q: string;
	a: string;
}

export interface Crumb {
	name: string;
	path: string;
}

const abs = (path: string) => new URL(path, SITE_URL).href;

const SECTION_LABELS: Record<string, string> = {
	calculators: 'Calculators',
	salary: 'Salary pages',
	hourly: 'Hourly pages',
	monthly: 'Monthly pages',
	guides: 'Guides',
	rates: 'Rates',
	budget: 'Budget',
};

export function crumbsFor(pathname: string, name: string): Crumb[] {
	const segs = pathname.split('/').filter(Boolean);
	const crumbs: Crumb[] = [{ name: 'Home', path: '/' }];
	if (segs.length === 0) return crumbs;
	if (segs.length > 1 && SECTION_LABELS[segs[0]]) crumbs.push({ name: SECTION_LABELS[segs[0]], path: `/${segs[0]}/` });
	crumbs.push({ name, path: pathname });
	return crumbs;
}

export function breadcrumbList(crumbs: Crumb[]): Node {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })),
	};
}

export const organisation: Node = {
	'@type': 'Organization',
	'@id': `${SITE_URL}/#organisation`,
	name: SITE_NAME,
	url: `${SITE_URL}/`,
	logo: `${SITE_URL}/favicon.svg`,
};

export function websiteNode(): Node {
	return {
		'@type': 'WebSite',
		'@id': `${SITE_URL}/#website`,
		name: SITE_NAME,
		url: `${SITE_URL}/`,
		description: SITE_DESCRIPTION,
		inLanguage: 'en-GB',
		publisher: { '@id': `${SITE_URL}/#organisation` },
	};
}

/** FAQ answers must be the same strings the page renders. */
export function faqPage(faqs: FaqPair[]): Node {
	return {
		'@type': 'FAQPage',
		mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
	};
}

export function webPage(opts: { url: string; title: string; description: string; modified: string }): Node {
	return {
		'@type': 'WebPage',
		url: opts.url,
		name: opts.title,
		description: opts.description,
		inLanguage: 'en-GB',
		dateModified: opts.modified,
		author: { '@type': 'Organization', name: AUTHOR.name, url: abs(AUTHOR.path) },
		publisher: { '@id': `${SITE_URL}/#organisation` },
	};
}

export function articleNode(a: { title: string; description: string; published: string; modified: string; url: string; image: string }): Node {
	return {
		'@type': 'Article',
		headline: a.title,
		description: a.description,
		inLanguage: 'en-GB',
		datePublished: a.published,
		dateModified: a.modified,
		image: a.image,
		mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
		author: { '@type': 'Organization', name: AUTHOR.name, url: abs(AUTHOR.path) },
		publisher: { '@id': `${SITE_URL}/#organisation` },
	};
}

export function datasetNode(opts: { name: string; description: string; url: string; distribution: string; modified: string }): Node {
	return {
		'@type': 'Dataset',
		name: opts.name,
		description: opts.description,
		url: opts.url,
		license: 'https://creativecommons.org/licenses/by/4.0/',
		isAccessibleForFree: true,
		dateModified: opts.modified,
		creator: { '@id': `${SITE_URL}/#organisation` },
		distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: opts.distribution },
	};
}

export function graph(nodes: Node[]) {
	return { '@context': 'https://schema.org', '@graph': nodes };
}
