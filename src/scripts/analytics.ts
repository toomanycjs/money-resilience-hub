// First-party, aggregate analytics with a visible opt-out, built to meet the
// UK statistical purposes exception: no third party, no advertising use, no
// identifier stored, and never a calculator input. The payload is the page
// path with the hash and query removed, the referrer's host, a viewport
// bucket and the names of inputs used (never their values).
//
// Nothing is sent unless PUBLIC_ANALYTICS_ENDPOINT is set at build time.

export const OPT_OUT_KEY = 'mrh:analytics';

export function optedOut(): boolean {
	try {
		if (localStorage.getItem(OPT_OUT_KEY) === 'off') return true;
	} catch {
		/* storage unavailable: treat as opted in to nothing special */
	}
	const n = navigator as Navigator & { globalPrivacyControl?: boolean };
	return n.doNotTrack === '1' || n.globalPrivacyControl === true;
}

export function setOptOut(off: boolean): void {
	try {
		if (off) localStorage.setItem(OPT_OUT_KEY, 'off');
		else localStorage.removeItem(OPT_OUT_KEY);
	} catch {
		/* nothing to store */
	}
}

/** Only these keys ever leave the page. */
const ALLOWED_KEYS = ['p', 'r', 'w', 'i'] as const;

export interface Hit {
	p: string;
	r: string;
	w: 'phone' | 'tablet' | 'laptop';
	i?: string[];
}

export function buildHit(pathname: string, referrer: string, width: number, inputsUsed: string[] = []): Hit {
	const hit: Hit = {
		p: pathname.split(/[?#]/)[0],
		r: referrerHost(referrer),
		w: width < 600 ? 'phone' : width < 1000 ? 'tablet' : 'laptop',
	};
	if (inputsUsed.length) hit.i = inputsUsed.filter((k) => /^[a-zA-Z]+$/.test(k)).slice(0, 10);
	for (const k of Object.keys(hit)) if (!(ALLOWED_KEYS as readonly string[]).includes(k)) delete (hit as Record<string, unknown>)[k];
	return hit;
}

function referrerHost(ref: string): string {
	try {
		const u = new URL(ref);
		const own = typeof location === 'undefined' ? '' : location.hostname;
		return u.hostname === own ? 'self' : u.hostname;
	} catch {
		return '';
	}
}

export function send(endpoint: string, hit: Hit): void {
	if (!endpoint || optedOut()) return;
	try {
		const body = JSON.stringify(hit);
		if (!navigator.sendBeacon || !navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) {
			fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' }, credentials: 'omit' }).catch(() => {});
		}
	} catch {
		/* analytics must never break the page */
	}
}

export function trackPage(endpoint: string): void {
	if (!endpoint) return;
	send(endpoint, buildHit(location.pathname, document.referrer, window.innerWidth));
	// Which inputs a calculator used, by name only, once the person leaves.
	const root = document.querySelector<HTMLElement>('[data-calculator]');
	if (!root) return;
	const used = new Set<string>();
	root.addEventListener('input', (e) => {
		const name = (e.target as HTMLInputElement | null)?.name;
		if (name) used.add(name);
	});
	addEventListener('pagehide', () => {
		if (used.size) send(endpoint, buildHit(location.pathname, document.referrer, window.innerWidth, [...used]));
	});
}
