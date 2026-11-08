// Hydrates a calculator: reads the form, computes in the browser and renders
// the same markup the build produced. Inputs stay here: they are saved to
// localStorage, carried in a share link's hash, and never sent anywhere.

import { RulesUnavailableError, listYears, takeHome, yearOnYear } from '@money-resilience-hub/rules';
import {
	DEFAULT_FORM,
	decodeShare,
	encodeShare,
	forgetInputs,
	formFromInput,
	loadSaved,
	parseForm,
	renderBar,
	renderFigure,
	renderLedger,
	renderRuler,
	renderRulesUsed,
	saveInputs,
	toText,
	type TakeHomeForm,
} from '@money-resilience-hub/calculators';

const root = document.querySelector<HTMLElement>('[data-calculator]');

if (root) {
	const form = root.querySelector('form') as HTMLFormElement;
	const asAt = root.dataset.asAt as string;
	const lockedGross = root.dataset.lockedGross ? Number(root.dataset.lockedGross) : null;
	const expanded = root.dataset.expanded === 'true';
	const siteUrl = root.dataset.siteUrl ?? '';
	const path = location.pathname;
	const el = (sel: string) => root.querySelector<HTMLElement>(sel);
	const status = document.querySelector<HTMLElement>('[data-status]');

	function read(): TakeHomeForm {
		const fd = new FormData(form);
		return {
			gross: lockedGross != null ? String(lockedGross) : String(fd.get('gross') ?? ''),
			nation: String(fd.get('nation') ?? DEFAULT_FORM.nation),
			taxCode: String(fd.get('taxCode') ?? ''),
			studentLoanPlans: fd.getAll('studentLoanPlans').map(String),
			pensionType: String(fd.get('pensionType') ?? ''),
			pensionPercent: String(fd.get('pensionPercent') ?? DEFAULT_FORM.pensionPercent),
			taxYear: fd.get('taxYear') ? String(fd.get('taxYear')) : undefined,
		};
	}

	function write(f: TakeHomeForm) {
		const set = (name: string, value: string) => {
			const c = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
			if (c && 'value' in c) c.value = value;
		};
		if (lockedGross == null) set('gross', f.gross);
		set('nation', f.nation);
		set('taxCode', f.taxCode);
		set('pensionType', f.pensionType);
		set('pensionPercent', f.pensionPercent);
		if (f.taxYear) set('taxYear', f.taxYear);
		for (const box of form.querySelectorAll<HTMLInputElement>('input[name="studentLoanPlans"]')) box.checked = f.studentLoanPlans.includes(box.value);
		syncPensionField();
	}

	function syncPensionField() {
		const type = (form.elements.namedItem('pensionType') as HTMLSelectElement | null)?.value ?? '';
		const field = el('[data-field="pensionPercent"]');
		if (field) field.hidden = type === '';
	}

	function render() {
		const f = read();
		const input = parseForm(f, asAt);
		const unavailable = el('[data-unavailable]');
		try {
			const b = takeHome(input);
			const ratesPath = `/rates/${b.taxYear}/`;
			const put = (sel: string, html: string) => {
				const target = el(sel);
				if (target) target.innerHTML = html;
			};
			put('[data-figure]', renderFigure(b));
			put('[data-ruler]', renderRuler(b));
			put('[data-ledger]', renderLedger(b, { ratesPath, expanded }));
			put('[data-bar]', renderBar(b));
			put('[data-rules-used]', renderRulesUsed(b, { ratesPath }));
			const changed = el('[data-what-changed]');
			if (changed) {
				const y = yearOnYear(input);
				changed.textContent = y ? y.sentence : '';
				changed.hidden = !y;
			}
			if (unavailable) unavailable.hidden = true;
			root!.dataset.result = JSON.stringify({ takeHome: b.takeHome });
			(root as HTMLElement & { __breakdown?: unknown }).__breakdown = b;
		} catch (e) {
			if (e instanceof RulesUnavailableError && unavailable) {
				unavailable.textContent = `This result cannot be shown yet: ${e.message}. Choose another nation or tax year, or check back once the rule is set.`;
				unavailable.hidden = false;
			} else throw e;
		}
	}

	function remember() {
		saveInputs(read());
	}

	// Pre-fill: a share link wins, then what this browser saved. Only the
	// display changes after load; the page served is the same for everyone.
	// With nothing saved, the markup the build rendered is already the result
	// for the default inputs, so there is nothing to re-render on load.
	const shared = decodeShare(location.hash);
	const saved = shared ?? loadSaved();
	if (saved) {
		write(lockedGross != null ? { ...saved, gross: String(lockedGross) } : saved);
		if (!shared) remember();
		render();
	} else {
		syncPensionField();
	}

	form.addEventListener('input', () => {
		syncPensionField();
		render();
		remember();
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
		let b = (root as HTMLElement & { __breakdown?: Parameters<typeof toText>[0] }).__breakdown;
		if (!b && (action === 'copy' || action === 'print')) {
			render();
			b = (root as HTMLElement & { __breakdown?: Parameters<typeof toText>[0] }).__breakdown;
		}
		if (action === 'copy' && b) {
			navigator.clipboard?.writeText(toText(b, siteUrl, path)).then(() => say('Copied as text.'), () => say('Could not copy.'));
		} else if (action === 'print') {
			window.print();
		} else if (action === 'share') {
			const url = `${siteUrl}${path}${encodeShare(read())}`;
			navigator.clipboard?.writeText(url).then(() => say('Link copied. Your inputs travel in the link itself and are never sent to us.'), () => say(url));
		} else if (action === 'forget') {
			forgetInputs();
			write({ ...DEFAULT_FORM, gross: lockedGross != null ? String(lockedGross) : DEFAULT_FORM.gross });
			render();
			say('Your inputs have been removed from this browser.');
		}
	});

	function say(text: string) {
		if (status) status.textContent = text;
	}

	// Tax year toggle: only years the engine can compute for the chosen nation.
	const yearSelect = form.elements.namedItem('taxYear') as HTMLSelectElement | null;
	if (yearSelect) {
		for (const opt of [...yearSelect.options]) {
			if (!listYears().some((y) => y.taxYear === opt.value)) opt.remove();
		}
	}
}
