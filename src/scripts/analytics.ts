// Google Analytics 4, loaded after the page has finished loading.
//
// One rule holds whatever else changes: nothing a person types into a
// calculator reaches analytics. Inputs only ever leave the form in a share
// link's hash, so before Google's script is added the hash is removed from
// the address bar, and the page address sent is the origin and path alone.
// A browser set to Do Not Track or Global Privacy Control is not counted.

declare global {
	interface Window {
		dataLayer?: unknown[];
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

/** True when the browser asks not to be tracked. */
export function browserOptedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } = navigator): boolean {
	return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

function start(id: string) {
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

export function loadGoogleAnalytics(id: string): void {
	if (!id || browserOptedOut()) return;
	if (document.readyState === 'complete') start(id);
	else addEventListener('load', () => start(id), { once: true });
}
