// The "jump to a salary" box. The amount typed stays in the browser: a page
// address holds only a salary that has its own page, and any other amount
// travels to the calculator in the hash, which is never sent to a server.

import { DEFAULT_FORM, encodeShare } from '@money-resilience-hub/calculators';

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-salary-jump]')) {
	const live = new Set((form.dataset.live ?? '').split(',').filter(Boolean).map(Number));
	const suffix = form.dataset.suffix ?? '';
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		const input = form.querySelector<HTMLInputElement>('input');
		let raw = (input?.value ?? '').toLowerCase().replace(/[£,\s]/g, '');
		// "30k" means thirty thousand.
		if (/^\d+(\.\d+)?k$/.test(raw)) raw = String(Math.round(parseFloat(raw) * 1000));
		const amount = Math.round(Number(raw));
		if (!Number.isFinite(amount) || amount <= 0) {
			input?.focus();
			return;
		}
		if (live.has(amount)) {
			location.href = `/salary/${amount}/${suffix}`;
			return;
		}
		const nation = suffix ? 'scotland' : DEFAULT_FORM.nation;
		location.href = `/calculators/take-home-pay/${encodeShare({ ...DEFAULT_FORM, gross: String(Math.min(amount, 10_000_000)), nation })}`;
	});
}
