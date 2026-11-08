// Formatting for money, rates and dates. British English throughout.

/** £ with thousands separators; two decimals in ledgers, none in headlines. */
export function money(n: number, decimals: 0 | 2 = 2): string {
	const sign = n < 0 ? '−' : '';
	return sign + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A rate such as 0.2 as "20%", 0.1075 as "10.75%". */
export function pct(rate: number): string {
	return `${+(rate * 100).toFixed(2)}%`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-07" as "7 November 2026". */
export function longDate(iso: string): string {
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return iso;
	return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-27" as "2026/27". */
export function yearLabel(taxYear: string): string {
	return taxYear.replace('-', '/');
}

/** A salary for a URL: 30000 for £30,000. */
export function amountSlug(n: number): string {
	return String(Math.round(n));
}

/** "£30,000" from a slug. */
export function amountFromSlug(slug: string): number | null {
	if (!/^\d{4,7}$/.test(slug)) return null;
	return Number(slug);
}

export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
