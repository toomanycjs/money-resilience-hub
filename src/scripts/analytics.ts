// Cookie consent and Google Analytics 4.
//
// Two rules hold whatever else changes.
//   1. Nothing is sent to Google until the visitor presses Accept. Before a
//      choice, and after Reject all, no analytics script is loaded.
//   2. Nothing a person types into a calculator ever reaches analytics,
//      whatever they chose. Inputs only leave the form in a share link's
//      hash, so the hash is removed from the address before Google's script
//      is added, and the page address sent is the origin and path alone.

declare global {
	interface Window {
		dataLayer?: unknown[];
	}
}

export const CONSENT_KEY = 'mrh:consent';
export type Consent = 'accepted' | 'rejected' | null;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/** The visitor's stored choice, or null if they have not chosen. */
export function readConsent(store: StorageLike | null = storage()): Consent {
	try {
		const v = store?.getItem(CONSENT_KEY);
		return v === 'accepted' || v === 'rejected' ? v : null;
	} catch {
		return null;
	}
}

export function writeConsent(choice: Exclude<Consent, null>, store: StorageLike | null = storage()): void {
	try {
		store?.setItem(CONSENT_KEY, choice);
	} catch {
		/* the choice then lasts for this page only */
	}
}

/** The address reported for a page: origin and path, never the hash or the query. */
export function pageLocation(href: string): string {
	try {
		const u = new URL(href);
		return u.origin + u.pathname;
	} catch {
		return '';
	}
}

let started = false;

function start(id: string) {
	if (started) return;
	started = true;
	// A share link's inputs live in the hash as "#s=...". The calculator has
	// read them by now; take them out of the address before anything is
	// recorded. Plain page anchors such as "#how" carry nothing and stay.
	if (location.hash.includes('=')) history.replaceState(null, '', location.pathname + location.search);

	window.dataLayer = window.dataLayer || [];
	// gtag.js expects the Arguments object, not an array.
	function gtag(..._args: unknown[]) {
		// eslint-disable-next-line prefer-rest-params
		window.dataLayer!.push(arguments);
	}
	gtag('js', new Date());
	gtag('config', id, { page_location: pageLocation(location.href) });

	const s = document.createElement('script');
	s.async = true;
	s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
	document.head.appendChild(s);
}

/** Load Google Analytics once the page has loaded, and only with consent. */
export function loadGoogleAnalytics(id: string): void {
	if (!id || readConsent() !== 'accepted') return;
	if (document.readyState === 'complete') start(id);
	else addEventListener('load', () => start(id), { once: true });
}

/** Stop counting on this page and remove Google Analytics cookies. */
function stop(id: string) {
	(window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = true;
	for (const part of document.cookie.split(';')) {
		const name = part.split('=')[0].trim();
		if (name === '_ga' || name.startsWith('_ga_')) {
			const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
			document.cookie = base;
			document.cookie = `${base}; domain=.${location.hostname.replace(/^www\./, '')}`;
		}
	}
}

/**
 * Wire up the cookie banner: show it when no choice is stored, record the
 * choice, and let the footer link reopen it.
 */
export function initConsent(id: string): void {
	const banner = document.querySelector<HTMLElement>('[data-cookie-banner]');
	if (!banner) return;
	const show = () => {
		banner.hidden = false;
	};
	const hide = () => {
		banner.hidden = true;
	};
	if (readConsent() === null) show();

	banner.querySelector('[data-cookie-accept]')?.addEventListener('click', () => {
		writeConsent('accepted');
		hide();
		(window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = false;
		loadGoogleAnalytics(id);
	});
	banner.querySelector('[data-cookie-reject]')?.addEventListener('click', () => {
		writeConsent('rejected');
		hide();
		stop(id);
	});
	for (const link of document.querySelectorAll('[data-cookie-choices]')) link.addEventListener('click', show);
}
