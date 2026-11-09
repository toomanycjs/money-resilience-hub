// Hydrates a single-purpose tool: reads the form, computes in the browser
// with the same engine the build used, and renders the same markup. Inputs
// stay here: saved to localStorage under the tool's own key, carried in a
// share link's hash, and never sent anywhere.

import { RulesUnavailableError } from '@money-resilience-hub/rules';
import {
	TOOLS,
	decodeSimpleShare,
	encodeSimpleShare,
	forgetSimpleInputs,
	loadSimpleSaved,
	renderLedger,
	renderRulesUsed,
	renderSimpleFigure,
	saveSimpleInputs,
	simpleToText,
	type SimpleForm,
	type SimpleResult,
} from '@money-resilience-hub/calculators';

const root = document.querySelector<HTMLElement>('[data-calculator][data-tool]');
const tool = root ? TOOLS[root.dataset.tool ?? ''] : undefined;

if (root && tool) {
	const form = root.querySelector('form') as HTMLFormElement;
	const asAt = root.dataset.asAt as string;
	const siteUrl = root.dataset.siteUrl ?? '';
	const defaults: SimpleForm = JSON.parse(root.dataset.defaults ?? '{}');
	const path = location.pathname;
	const el = (sel: string) => root.querySelector<HTMLElement>(sel);
	const status = document.querySelector<HTMLElement>('[data-status]');
	let current: SimpleResult | null = null;

	function read(): SimpleForm {
		const fd = new FormData(form);
		const out: SimpleForm = {};
		for (const f of tool!.fields) out[f.id] = fd.get(f.id) != null ? String(fd.get(f.id)) : defaults[f.id] ?? f.default;
		return out;
	}

	function write(f: SimpleForm) {
		for (const field of tool!.fields) {
			const c = form.elements.namedItem(field.id) as HTMLInputElement | HTMLSelectElement | null;
			if (c && 'value' in c) c.value = f[field.id] ?? field.default;
		}
		syncVisibility();
	}

	function syncVisibility() {
		const f = read();
		for (const field of tool!.fields) {
			if (!field.showWhen) continue;
			const wrap = el(`[data-field="${field.id}"]`);
			if (wrap) wrap.hidden = !field.showWhen.values.includes(f[field.showWhen.field]);
		}
	}

	function render() {
		const f = read();
		const unavailable = el('[data-unavailable]');
		const put = (sel: string, html: string) => {
			const target = el(sel) ?? document.querySelector<HTMLElement>(sel);
			if (target) target.innerHTML = html;
		};
		try {
			const r = tool!.compute(f, asAt);
			current = r;
			const ratesPath = `/rates/${r.taxYear}/`;
			put('[data-figure]', renderSimpleFigure(r));
			put('[data-ledger]', renderLedger(r, { ratesPath, amountHeading: tool!.amountHeading }));
			put('[data-rules-used]', renderRulesUsed(r, { ratesPath }));
			const changed = el('[data-what-changed]');
			if (changed) {
				changed.textContent = r.comparison ? r.comparison.sentence : '';
				changed.hidden = !r.comparison;
			}
			if (unavailable) unavailable.hidden = true;
			root!.dataset.result = JSON.stringify({ amount: r.headline.amount });
		} catch (e) {
			if (e instanceof RulesUnavailableError && unavailable) {
				unavailable.textContent = `This result cannot be shown yet: ${e.message.replace(/^[\w.[\]-]+: /, '')}. Choose another nation or tax year, or check back once the rule is set.`;
				unavailable.hidden = false;
			} else throw e;
		}
	}

	// Pre-fill: a share link wins, then what this browser saved. With nothing
	// saved, the markup the build rendered is already the default result.
	const shared = decodeSimpleShare(tool, location.hash);
	const saved = shared ?? loadSimpleSaved(tool);
	if (saved) {
		write(saved);
		if (!shared) saveSimpleInputs(tool, saved);
		render();
	} else {
		syncVisibility();
	}

	form.addEventListener('input', () => {
		syncVisibility();
		render();
		saveSimpleInputs(tool, read());
	});
	form.addEventListener('submit', (e) => e.preventDefault());

	document.addEventListener('click', (e) => {
		const t = e.target as HTMLElement;
		const toggle = t.closest<HTMLButtonElement>('.ledger-toggle');
		if (toggle) {
			const row = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
			const open = toggle.getAttribute('aria-expanded') === 'true';
			toggle.setAttribute('aria-expanded', String(!open));
			if (row) row.hidden = open;
			return;
		}
		const action = t.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
		if (!action) return;
		if (!current && (action === 'copy' || action === 'print')) render();
		if (action === 'copy' && current) {
			navigator.clipboard?.writeText(simpleToText(current, siteUrl, path)).then(() => say('Copied as text.'), () => say('Could not copy.'));
		} else if (action === 'print') {
			window.print();
		} else if (action === 'share') {
			const url = `${siteUrl}${path}${encodeSimpleShare(tool!, read())}`;
			navigator.clipboard?.writeText(url).then(() => say('Link copied. Your inputs travel in the link itself and are never sent to us.'), () => say(url));
		} else if (action === 'forget') {
			forgetSimpleInputs(tool!);
			write(defaults);
			render();
			say('Your inputs have been removed from this browser.');
		}
	});

	function say(text: string) {
		if (status) status.textContent = text;
	}
}
