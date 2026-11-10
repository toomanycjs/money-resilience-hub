// Sorts a table marked data-sortable when a column heading is pressed. The
// headings are rendered as buttons at build time, so the table reads as a
// plain table without this script. A cell's data-value, when present, is
// compared as a number (an empty one sorts last); otherwise its text is
// compared. Nothing leaves the page.

const DIRECTION: Record<string, 'ascending' | 'descending'> = { ascending: 'descending', descending: 'ascending' };

for (const table of document.querySelectorAll<HTMLTableElement>('table[data-sortable]')) {
	const body = table.tBodies[0];
	if (!body) continue;
	const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
	headers.forEach((th, col) => {
		const button = th.querySelector<HTMLButtonElement>('button[data-sort]');
		if (!button) return;
		button.addEventListener('click', () => {
			const numeric = button.dataset.sort === 'num';
			const current = th.getAttribute('aria-sort');
			// A first press on a number column shows the largest first; on a text column, A to Z.
			const direction = current ? DIRECTION[current] : numeric ? 'descending' : 'ascending';
			for (const h of headers) h.removeAttribute('aria-sort');
			th.setAttribute('aria-sort', direction);
			const rows = Array.from(body.rows);
			const key = (row: HTMLTableRowElement) => {
				const cell = row.cells[col];
				if (!cell) return numeric ? null : '';
				if (numeric) {
					const v = cell.dataset.value ?? cell.textContent ?? '';
					const n = Number(v.replace(/[£,%\s]/g, ''));
					return v === '' || Number.isNaN(n) ? null : n;
				}
				return (cell.textContent ?? '').trim().toLowerCase();
			};
			const sign = direction === 'ascending' ? 1 : -1;
			rows.sort((a, b) => {
				const ka = key(a);
				const kb = key(b);
				if (ka === null && kb === null) return 0;
				if (ka === null) return 1;
				if (kb === null) return -1;
				if (typeof ka === 'number' && typeof kb === 'number') return sign * (ka - kb);
				return sign * String(ka).localeCompare(String(kb), 'en-GB');
			});
			for (const row of rows) body.appendChild(row);
		});
	});
}
